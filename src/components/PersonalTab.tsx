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

  async function handleUpdateProfile(display_name: string) {
    const supabase = createClient();
    if (!profile) return;
    await supabase.from("profiles").update({ display_name }).eq("id", profile.id);
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-base font-bold">プロフィール</h2>
        <ProfileBlock profile={profile} email={email} onSave={handleUpdateProfile} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold">個人カレンダー</h2>
        <CalendarForm onSubmit={handleCreate} />
        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-neutral-500">読み込み中…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-neutral-500">予定はまだありません。</p>
          ) : (
            <ul className="divide-y divide-black border border-black">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium">{ev.title}</p>
                    <p className="text-xs text-neutral-600">
                      {new Date(ev.starts_at).toLocaleString("ja-JP")} 〜{" "}
                      {new Date(ev.ends_at).toLocaleString("ja-JP")}
                    </p>
                    {ev.description && (
                      <p className="mt-1 text-sm text-neutral-700">{ev.description}</p>
                    )}
                  </div>
                  <button onClick={() => handleDelete(ev.id)} className="text-xs underline">
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold">Hubs アカウント情報 / 入室履歴</h2>
        <p className="text-sm text-neutral-500">Phase 2 で Reticulum API と連携予定。</p>
      </section>
    </div>
  );
}

function ProfileBlock({
  profile,
  email,
  onSave,
}: {
  profile: Profile | null;
  email: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(name);
    setSaving(false);
  }

  return (
    <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
      <dt className="text-neutral-600">Email</dt>
      <dd>{email}</dd>
      <dt className="text-neutral-600">表示名</dt>
      <dd className="flex gap-2">
        <input
          className="border border-black px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="未設定"
        />
        <button onClick={handleSave} disabled={saving} className="bg-black px-3 text-white">
          保存
        </button>
      </dd>
      <dt className="text-neutral-600">プラン</dt>
      <dd>{profile?.plan_tier ?? "free"}</dd>
    </dl>
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

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 text-sm">
      <input
        className="col-span-2 border border-black px-3 py-2"
        placeholder="タイトル"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        type="datetime-local"
        className="border border-black px-3 py-2"
        value={startsAt}
        onChange={(e) => setStartsAt(e.target.value)}
      />
      <input
        type="datetime-local"
        className="border border-black px-3 py-2"
        value={endsAt}
        onChange={(e) => setEndsAt(e.target.value)}
      />
      <textarea
        className="col-span-2 border border-black px-3 py-2"
        placeholder="メモ (任意)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <button type="submit" className="col-span-2 bg-black py-2 text-white">
        追加
      </button>
    </form>
  );
}
