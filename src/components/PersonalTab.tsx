"use client";

import { useEffect, useState } from "react";
import { MonthlyCalendarPanel } from "@/components/events/MonthlyCalendarPanel";
import type { CalendarEventSummary, Profile } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { FavoriteWorldsPanel } from "./world/FavoriteWorldsPanel";

export function PersonalTab({
  profile,
  email,
  onOpenEventsCalendar,
  canManageWorldCollections = false,
}: {
  profile: Profile | null;
  email: string;
  onOpenEventsCalendar: () => void;
  canManageWorldCollections?: boolean;
}) {
  const [events, setEvents] = useState<CalendarEventSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/calendar?scope=mine");
    if (res.ok) {
      const data = (await res.json()) as CalendarEventSummary[];
      setEvents(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/calendar/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function handleUpdateProfile(display_name: string): Promise<string | null> {
    const supabase = createClient();
    if (!profile) return "プロフィールがまだ作成されていません";
    const { error } = await supabase
      .from("profiles")
      .update({ display_name })
      .eq("id", profile.id);
    return error ? error.message : null;
  }

  async function handleUploadAvatar(file: File): Promise<string | null> {
    const supabase = createClient();
    if (!profile) return "プロフィールがまだ作成されていません";
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${profile.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) return upErr.message;
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);
    // キャッシュバスター付きで保存
    const urlWithBust = `${publicUrl}?v=${Date.now()}`;
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: urlWithBust })
      .eq("id", profile.id);
    if (updErr) return updErr.message;
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card title="個人カレンダー" subtitle="自分だけに見える予定">
          {loading ? (
            <p className="text-sm text-slate-400">読み込み中…</p>
          ) : events.length === 0 ? (
            <EmptyState title="予定はまだありません" hint="イベントタブから追加できます" />
          ) : (
            <MonthlyCalendarPanel
              events={events}
              createButtonLabel="+ イベント"
              onCreateClick={onOpenEventsCalendar}
            />
          )}
          {events.length > 0 ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onOpenEventsCalendar}
                className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
              >
                Events タブで管理
              </button>
            </div>
          ) : null}
        </Card>

        <Card title="Hubs アカウント情報" subtitle="Reticulum DB と連携">
          <HubsAccountBlock />
        </Card>

        <Card
          title="お気に入りワールド"
          subtitle="個人メモ・おすすめ公開・レビューを管理"
        >
          <FavoriteWorldsPanel canManageCollections={canManageWorldCollections} />
        </Card>

        <Card
          title="入室履歴"
          subtitle="Phase 3b（WS サイドカー）導入後に有効化"
        >
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-slate-400">
            Reticulum は入室履歴を永続化しないため、現在は未対応です。
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="プロフィール" subtitle="アカウント基本情報">
          <ProfileBlock
            profile={profile}
            email={email}
            onSave={handleUpdateProfile}
            onUploadAvatar={handleUploadAvatar}
          />
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/5 bg-bg-secondary/40 p-5 shadow-card md:p-6">
      <header className="mb-4">
        <h2 className="text-base font-bold text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
      <p className="text-sm text-slate-300">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

type HubsMeResponse = {
  configured: boolean;
  message?: string;
  account: {
    account_id: number;
    email: string;
    display_name: string | null;
    identity_name: string | null;
    created_at: string;
  } | null;
};

function HubsAccountBlock() {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [data, setData] = useState<HubsMeResponse | null>(null);

  useEffect(() => {
    fetch("/api/hubs/me")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setData((await r.json()) as HubsMeResponse);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "loading") {
    return <p className="text-sm text-slate-400">読み込み中…</p>;
  }
  if (state === "error" || !data) {
    return <p className="text-sm text-red-400">Hubs 情報の取得に失敗しました。</p>;
  }
  if (!data.configured) {
    return (
      <p className="text-sm text-slate-400">
        Reticulum DB 未接続（{data.message ?? "管理者に問い合わせてください"}）。
      </p>
    );
  }
  if (!data.account) {
    return (
      <p className="text-sm text-slate-400">
        {data.message ?? "Hubs アカウントが見つかりません"}。Hubs で同じメールアドレスでログイン後、再読み込みしてください。
      </p>
    );
  }

  const a = data.account;
  return (
    <dl className="grid grid-cols-[128px_1fr] gap-y-3 text-sm">
      <DT>Hubs Account ID</DT>
      <DD mono>{a.account_id}</DD>
      <DT>Identity</DT>
      <DD>{a.identity_name ?? "（未設定）"}</DD>
      <DT>登録日</DT>
      <DD>{new Date(a.created_at).toLocaleDateString("ja-JP")}</DD>
    </dl>
  );
}

function DT({ children }: { children: React.ReactNode }) {
  return <dt className="text-xs text-slate-400">{children}</dt>;
}

function DD({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <dd className={mono ? "font-mono text-white" : "text-white"}>{children}</dd>;
}

function ProfileBlock({
  profile,
  email,
  onSave,
  onUploadAvatar,
}: {
  profile: Profile | null;
  email: string;
  onSave: (name: string) => Promise<string | null>;
  onUploadAvatar: (file: File) => Promise<string | null>;
}) {
  const [name, setName] = useState(profile?.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const err = await onSave(name);
    setSaving(false);
    if (err) {
      setMessage({ kind: "error", text: `保存に失敗しました: ${err}` });
    } else {
      setMessage({
        kind: "success",
        text: `保存しました (${new Date().toLocaleTimeString("ja-JP")})`,
      });
      window.setTimeout(() => setMessage(null), 4000);
    }
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ kind: "error", text: "画像は 5MB 以下にしてください" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMessage({ kind: "error", text: "画像ファイルを選んでください" });
      return;
    }
    setUploading(true);
    setMessage(null);
    // 楽観的プレビュー
    const localUrl = URL.createObjectURL(file);
    setAvatarUrl(localUrl);
    const err = await onUploadAvatar(file);
    setUploading(false);
    if (err) {
      setAvatarUrl(profile?.avatar_url ?? null);
      setMessage({ kind: "error", text: `アップロード失敗: ${err}` });
    } else {
      setMessage({
        kind: "success",
        text: `アバターを更新しました (${new Date().toLocaleTimeString("ja-JP")})`,
      });
      window.setTimeout(() => setMessage(null), 4000);
    }
  }

  const initials = (profile?.display_name?.trim() || email || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="avatar"
              className="h-20 w-20 rounded-full object-cover ring-2 ring-accent-primary/40"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-primary/20 text-2xl font-bold text-accent-soft ring-2 ring-accent-primary/40">
              {initials}
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs text-white">
              送信中…
            </div>
          )}
        </div>
        <div className="flex-1">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            画像を選ぶ
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handlePickFile}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <p className="mt-1.5 text-[10px] text-slate-500">PNG / JPEG / WEBP / GIF、5MB まで</p>
        </div>
      </div>

      <Field label="Email">
        <span className="break-all text-white">{email}</span>
      </Field>

      <Field label="表示名">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-bg-primary px-3 py-1.5 text-white outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="未設定"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </Field>

      <Field label="プラン">
        <PlanBadge tier={profile?.plan_tier ?? "free"} />
      </Field>

      {message && (
        <p
          role="status"
          aria-live="polite"
          className={
            message.kind === "success"
              ? "text-xs text-emerald-400"
              : "text-xs text-red-400"
          }
        >
          {message.kind === "success" ? "✓ " : "✗ "}
          {message.text}
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-3">
      <span className="pt-1.5 text-xs text-slate-400">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function PlanBadge({ tier }: { tier: string }) {
  const color =
    tier === "enterprise"
      ? "bg-accent-primary/20 text-accent-soft ring-accent-primary/30"
      : tier === "professional"
        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
        : tier === "standard"
          ? "bg-sky-500/15 text-sky-300 ring-sky-500/30"
          : "bg-white/5 text-slate-300 ring-white/10";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${color}`}
    >
      {tier}
    </span>
  );
}
