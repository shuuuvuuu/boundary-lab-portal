"use client";

import { useState, type ReactNode } from "react";
import { detectPlatform } from "@/lib/worlds/detect-platform";
import { PLATFORM_BADGE_CLASSNAMES, PLATFORM_LABELS } from "@/lib/worlds/platforms";
import { createClient } from "@/lib/supabase/client";
import type { Platform } from "@/types/worlds";

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

export type WorldFormValues = {
  url: string;
  name: string;
  description: string;
  thumbnail_url: string;
  tags: string[];
  platform: Platform;
  external_id: string;
};

export function WorldForm({
  onSubmit,
  submitLabel = "保存",
  children,
}: {
  onSubmit: (values: WorldFormValues) => Promise<string | null>;
  submitLabel?: string;
  children?: ReactNode;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  const detected = detectPlatform(url);
  const inputClass =
    "w-full rounded-xl border border-white/10 bg-bg-primary px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!detected || !name.trim()) {
      setMessage({ kind: "error", text: "URL と名前を確認してください。" });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const error = await onSubmit({
      url: detected.normalizedUrl,
      name: name.trim(),
      description: description.trim(),
      thumbnail_url: thumbnailUrl.trim(),
      tags: tagsInput.split(",").map((tag) => tag.trim()),
      platform: detected.platform,
      external_id: detected.externalId,
    });
    setSubmitting(false);

    if (error) {
      setMessage({ kind: "error", text: error });
      return;
    }

    setUrl("");
    setName("");
    setDescription("");
    setThumbnailUrl("");
    setTagsInput("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-white/10 bg-bg-secondary/30 p-4"
    >
      <div className="space-y-2">
        <label className="text-xs text-slate-400">ワールド URL</label>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://vrchat.com/home/world/wrld_..."
          className={inputClass}
        />
        {detected ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold ${PLATFORM_BADGE_CLASSNAMES[detected.platform]}`}
            >
              {PLATFORM_LABELS[detected.platform]}
            </span>
            <span className="text-slate-400">external_id: {detected.externalId}</span>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            URL を貼ると platform を自動判定します。
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs text-slate-400">名前</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Boundary LAB Showcase"
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
      </div>

      <label className="space-y-2">
        <span className="text-xs text-slate-400">説明</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="このワールドの見どころ"
          className={inputClass}
        />
      </label>

      <label className="space-y-2">
        <span className="text-xs text-slate-400">タグ</span>
        <input
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
          placeholder="gallery, live, meetup"
          className={inputClass}
        />
      </label>

      {children}

      {message ? <p className="text-xs text-rose-300">{message.text}</p> : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-accent-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? "保存中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
