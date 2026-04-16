"use client";

import { useState } from "react";
import { normalizeTags } from "@/lib/worlds/registry";
import { createClient } from "@/lib/supabase/client";
import type { WorldSummary } from "@/types/worlds";

async function uploadThumbnail(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const safeExt = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? ext : "png";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const { error } = await supabase.storage
    .from("world-thumbnails")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const {
    data: { publicUrl },
  } = supabase.storage.from("world-thumbnails").getPublicUrl(path);
  return publicUrl;
}

async function parseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `request failed (${response.status})`;
  } catch {
    return `request failed (${response.status})`;
  }
}

export function WorldEditModal({
  world,
  canDelete,
  onClose,
  onSaved,
}: {
  world: WorldSummary;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(world.name);
  const [description, setDescription] = useState(world.description ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(world.thumbnail_url ?? "");
  const [tagsInput, setTagsInput] = useState(world.tags.join(", "));
  const [recurringSchedule, setRecurringSchedule] = useState(world.recurring_schedule ?? "");
  const [nextEventAt, setNextEventAt] = useState(
    world.next_event_at ? world.next_event_at.slice(0, 16) : "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error"; text: string } | null>(null);

  async function handleFilePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ kind: "error", text: "画像は 5MB 以内にしてください。" });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const url = await uploadThumbnail(file);
      setThumbnailUrl(url);
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "画像アップロードに失敗しました。",
      });
    } finally {
      setUploading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!name.trim()) {
      setMessage({ kind: "error", text: "名前を入力してください。" });
      return;
    }

    setSaving(true);
    setMessage(null);
    const response = await fetch(`/api/worlds/${world.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description,
        thumbnail_url: thumbnailUrl,
        tags: normalizeTags(tagsInput),
        recurring_schedule: recurringSchedule,
        next_event_at: nextEventAt || null,
      }),
    });
    setSaving(false);

    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }

    await onSaved();
  }

  async function handleDelete() {
    if (!window.confirm(`「${world.name}」を削除します。元に戻せません。`)) {
      return;
    }

    setDeleting(true);
    setMessage(null);
    const response = await fetch(`/api/worlds/${world.id}`, {
      method: "DELETE",
    });
    setDeleting(false);

    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }

    await onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${world.name} を編集`}
        className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">World Edit</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">ワールドを編集</h2>
            <p className="mt-2 text-sm text-slate-400">
              名前、説明、サムネイル、タグを更新します。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="space-y-2">
            <span className="text-xs text-slate-400">名前</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs text-slate-400">説明</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className={inputClass}
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs text-slate-400">サムネイル（画像アップロード or URL）</span>
            <div className="flex items-center gap-3">
              {thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="h-12 w-12 flex-shrink-0 rounded-lg border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/[0.03] text-[10px] text-slate-500">
                  画像
                </div>
              )}
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleFilePick}
                  className="hidden"
                />
                <span className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10">
                  {uploading ? "アップロード中…" : thumbnailUrl ? "画像を差し替え" : "画像をアップロード"}
                </span>
              </label>
            </div>
            <input
              value={thumbnailUrl}
              onChange={(event) => setThumbnailUrl(event.target.value)}
              placeholder="または URL を直接入力"
              className={inputClass}
            />
          </div>

          <label className="space-y-2">
            <span className="text-xs text-slate-400">タグ</span>
            <input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="gallery, meetup, live"
              className={inputClass}
            />
          </label>

          {canDelete ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs text-slate-400">定期スケジュール</span>
                <textarea
                  value={recurringSchedule}
                  onChange={(event) => setRecurringSchedule(event.target.value)}
                  rows={3}
                  placeholder="毎週金曜 21:00 JST"
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs text-slate-400">次回開催日時</span>
                <input
                  type="datetime-local"
                  value={nextEventAt}
                  onChange={(event) => setNextEventAt(event.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          ) : null}

          {message ? <p className="text-sm text-rose-300">{message.text}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {canDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
              >
                {deleting ? "削除中…" : "このワールドを削除"}
              </button>
            ) : (
              <span className="text-xs text-slate-500">
                削除は enterprise ユーザーのみ実行できます。
              </span>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
