"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent, NewCalendarEvent, Profile } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

export function PersonalTab({ profile, email }: { profile: Profile | null; email: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/calendar");
    if (res.ok) {
      const data = (await res.json()) as CalendarEvent[];
      setEvents(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(payload: NewCalendarEvent) {
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) await load();
  }

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

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card title="個人カレンダー" subtitle="自分だけに見える予定">
          <CalendarForm onSubmit={handleCreate} />
          <div className="mt-6">
            {loading ? (
              <p className="text-sm text-slate-400">読み込み中…</p>
            ) : events.length === 0 ? (
              <EmptyState
                title="予定はまだありません"
                hint="上のフォームから追加できます"
              />
            ) : (
              <ul className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/5 bg-bg-secondary/40">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-start justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{ev.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {new Date(ev.starts_at).toLocaleString("ja-JP")}
                        <span className="mx-1">〜</span>
                        {new Date(ev.ends_at).toLocaleString("ja-JP")}
                      </p>
                      {ev.description && (
                        <p className="mt-1 text-sm text-slate-300">{ev.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(ev.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card title="Hubs アカウント情報" subtitle="Reticulum DB と連携">
          <HubsAccountBlock />
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
          <ProfileBlock profile={profile} email={email} onSave={handleUpdateProfile} />
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
}: {
  profile: Profile | null;
  email: string;
  onSave: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);
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

  return (
    <div className="space-y-4 text-sm">
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
        {message && (
          <p
            role="status"
            aria-live="polite"
            className={
              message.kind === "success"
                ? "mt-2 text-xs text-emerald-400"
                : "mt-2 text-xs text-red-400"
            }
          >
            {message.kind === "success" ? "✓ " : "✗ "}
            {message.text}
          </p>
        )}
      </Field>

      <Field label="プラン">
        <PlanBadge tier={profile?.plan_tier ?? "free"} />
      </Field>
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

function CalendarForm({ onSubmit }: { onSubmit: (ev: NewCalendarEvent) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !startsAt || !endsAt) return;
    await onSubmit({
      title,
      description: description || null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
    });
    setTitle("");
    setDescription("");
    setStartsAt("");
    setEndsAt("");
  }

  const inputClass =
    "w-full rounded-md border border-white/10 bg-bg-primary px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary";

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <input
        className={`${inputClass} md:col-span-2`}
        placeholder="タイトル"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        type="datetime-local"
        className={inputClass}
        value={startsAt}
        onChange={(e) => setStartsAt(e.target.value)}
      />
      <input
        type="datetime-local"
        className={inputClass}
        value={endsAt}
        onChange={(e) => setEndsAt(e.target.value)}
      />
      <textarea
        className={`${inputClass} md:col-span-2`}
        placeholder="メモ (任意)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <button
        type="submit"
        className="rounded-md bg-accent-primary py-2 text-sm font-medium text-white transition hover:bg-accent-hover md:col-span-2"
      >
        追加
      </button>
    </form>
  );
}
