"use client";

import { useEffect, useState } from "react";
import { MonthlyCalendarPanel } from "@/components/events/MonthlyCalendarPanel";
import type { CollectionSummary } from "@/types/collections";
import type { CalendarEventSummary, NewCalendarEvent } from "@/types/database";
import type { WorldSummary } from "@/types/worlds";

export type EventsSubtabKey = "calendar" | "collections" | "live";

type Message = {
  kind: "success" | "error";
  text: string;
};

async function parseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `request failed (${response.status})`;
  } catch {
    return `request failed (${response.status})`;
  }
}

async function fetchJson<T>(input: string): Promise<T> {
  const response = await fetch(input, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  return (await response.json()) as T;
}

export function EventsTab({
  initialSubtab = "calendar",
  onSubtabChange,
}: {
  initialSubtab?: EventsSubtabKey;
  onSubtabChange?: (value: EventsSubtabKey) => void;
}) {
  const [subtab, setSubtab] = useState<EventsSubtabKey>(initialSubtab);
  const [events, setEvents] = useState<CalendarEventSummary[]>([]);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    setSubtab(initialSubtab);
  }, [initialSubtab]);

  useEffect(() => {
    onSubtabChange?.(subtab);
  }, [onSubtabChange, subtab]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [eventsData, collectionData, worldData] = await Promise.all([
        fetchJson<CalendarEventSummary[]>("/api/calendar?scope=visible"),
        fetchJson<CollectionSummary[]>("/api/collections?scope=mine"),
        fetchJson<WorldSummary[]>("/api/worlds?sort=recent&limit=100"),
      ]);
      setEvents(eventsData);
      setCollections(collectionData);
      setWorlds(worldData);
      setMessage(null);
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "読み込みに失敗しました。",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateEvent(payload: NewCalendarEvent) {
    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }

    setShowCreateModal(false);
    setMessage({ kind: "success", text: "イベントを作成しました。" });
    await loadAll();
  }

  async function handleCreateCollection(payload: {
    name: string;
    description: string;
    is_public: boolean;
  }) {
    const response = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }

    setMessage({ kind: "success", text: "コレクションを作成しました。" });
    await loadAll();
  }

  async function handleDeleteCollection(collectionId: string) {
    const response = await fetch(`/api/collections/${collectionId}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }
    setMessage({ kind: "success", text: "コレクションを削除しました。" });
    await loadAll();
  }

  async function handleAddWorldToCollection(collectionId: string, worldId: string) {
    const response = await fetch(`/api/collections/${collectionId}/worlds/${worldId}`, {
      method: "POST",
    });
    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }
    setMessage({ kind: "success", text: "コレクションに追加しました。" });
    await loadAll();
  }

  async function handleRemoveWorldFromCollection(collectionId: string, worldId: string) {
    const response = await fetch(`/api/collections/${collectionId}/worlds/${worldId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }
    setMessage({ kind: "success", text: "コレクションから除外しました。" });
    await loadAll();
  }

  const liveWorlds = [...worlds]
    .filter((world) => Boolean(world.upcoming_event))
    .sort(
      (left, right) =>
        new Date(left.upcoming_event?.starts_at ?? left.created_at).getTime() -
        new Date(right.upcoming_event?.starts_at ?? right.created_at).getTime(),
    );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_35%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(17,24,39,0.92))] p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Events</p>
            <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
              開催予定・コレクション・ライブ情報
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              個人イベントと公開イベントを月次カレンダーで管理し、テーマ別コレクションと近い開催予定を横断的に見られます。
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
            イベント {events.length} / コレクション {collections.length}
          </div>
        </div>

        <div className="mt-6 inline-flex rounded-full border border-white/10 bg-slate-950/50 p-1">
          <SubtabButton active={subtab === "calendar"} onClick={() => setSubtab("calendar")}>
            カレンダー
          </SubtabButton>
          <SubtabButton active={subtab === "collections"} onClick={() => setSubtab("collections")}>
            コレクション
          </SubtabButton>
          <SubtabButton active={subtab === "live"} onClick={() => setSubtab("live")}>
            配信・ライブ
          </SubtabButton>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${message.kind === "success" ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200" : "border border-rose-500/20 bg-rose-500/10 text-rose-200"}`}
        >
          {message.text}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
          イベントデータを読み込み中…
        </div>
      ) : subtab === "calendar" ? (
        <section className="rounded-3xl border border-white/10 bg-bg-secondary/40 p-5 shadow-card md:p-6">
          <MonthlyCalendarPanel
            events={events}
            showOwner
            createButtonLabel="イベント作成"
            onCreateClick={() => setShowCreateModal(true)}
          />
        </section>
      ) : subtab === "collections" ? (
        <CollectionsPanel
          collections={collections}
          worlds={worlds}
          onCreate={handleCreateCollection}
          onDelete={handleDeleteCollection}
          onAddWorld={handleAddWorldToCollection}
          onRemoveWorld={handleRemoveWorldFromCollection}
        />
      ) : (
        <LivePanel worlds={liveWorlds} />
      )}

      {showCreateModal ? (
        <CreateEventModal
          worlds={worlds}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateEvent}
        />
      ) : null}
    </div>
  );
}

function SubtabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${active ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-white/5"}`}
    >
      {children}
    </button>
  );
}

function CollectionsPanel({
  collections,
  worlds,
  onCreate,
  onDelete,
  onAddWorld,
  onRemoveWorld,
}: {
  collections: CollectionSummary[];
  worlds: WorldSummary[];
  onCreate: (payload: { name: string; description: string; is_public: boolean }) => Promise<void>;
  onDelete: (collectionId: string) => Promise<void>;
  onAddWorld: (collectionId: string, worldId: string) => Promise<void>;
  onRemoveWorld: (collectionId: string, worldId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    await onCreate({ name: name.trim(), description, is_public: isPublic });
    setName("");
    setDescription("");
    setIsPublic(true);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-bg-secondary/40 p-5 shadow-card md:p-6">
        <h3 className="text-lg font-semibold text-white">コレクションを作成</h3>
        <p className="mt-1 text-sm text-slate-400">自分のテーマ別プレイリストとして使えます。</p>
        <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例: 今週のライブ会場"
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
            />
            公開コレクションにする
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="説明"
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 md:col-span-2"
          />
          <button
            type="submit"
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 md:col-span-2"
          >
            作成
          </button>
        </form>
      </section>

      {collections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-sm text-slate-400">
          まだコレクションはありません。
        </div>
      ) : (
        <div className="space-y-4">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              worlds={worlds}
              onDelete={onDelete}
              onAddWorld={onAddWorld}
              onRemoveWorld={onRemoveWorld}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionCard({
  collection,
  worlds,
  onDelete,
  onAddWorld,
  onRemoveWorld,
}: {
  collection: CollectionSummary;
  worlds: WorldSummary[];
  onDelete: (collectionId: string) => Promise<void>;
  onAddWorld: (collectionId: string, worldId: string) => Promise<void>;
  onRemoveWorld: (collectionId: string, worldId: string) => Promise<void>;
}) {
  const [selectedWorldId, setSelectedWorldId] = useState("");
  const availableWorlds = worlds.filter(
    (world) => !collection.worlds.some((item) => item.id === world.id),
  );

  return (
    <section className="rounded-3xl border border-white/10 bg-bg-secondary/40 p-5 shadow-card md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{collection.name}</h3>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${collection.is_public ? "bg-cyan-500/15 text-cyan-100" : "bg-white/10 text-slate-300"}`}
            >
              {collection.is_public ? "Public" : "Private"}
            </span>
          </div>
          {collection.description ? (
            <p className="mt-2 text-sm leading-6 text-slate-300">{collection.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDelete(collection.id)}
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20"
        >
          削除
        </button>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <select
            value={selectedWorldId}
            onChange={(event) => setSelectedWorldId(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          >
            <option value="">ワールドを追加</option>
            {availableWorlds.map((world) => (
              <option key={world.id} value={world.id}>
                {world.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedWorldId}
            onClick={async () => {
              if (!selectedWorldId) {
                return;
              }
              await onAddWorld(collection.id, selectedWorldId);
              setSelectedWorldId("");
            }}
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50"
          >
            追加
          </button>
        </div>

        {collection.worlds.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-500">
            ワールドはまだ追加されていません。
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {collection.worlds.map((world) => (
              <div
                key={world.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{world.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{world.platform}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveWorld(collection.id, world.id)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                >
                  除外
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LivePanel({ worlds }: { worlds: WorldSummary[] }) {
  return (
    <section className="space-y-4 rounded-3xl border border-white/10 bg-bg-secondary/40 p-5 shadow-card md:p-6">
      <div>
        <h3 className="text-lg font-semibold text-white">近い開催予定</h3>
        <p className="mt-1 text-sm text-slate-400">
          `next_event_at` と公開イベントに基づく近い順の一覧です。
        </p>
      </div>

      {worlds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-sm text-slate-500">
          近い開催予定のあるワールドはまだありません。
        </div>
      ) : (
        <div className="space-y-3">
          {worlds.map((world) => (
            <div
              key={world.id}
              className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-white">{world.name}</p>
                  <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                    {world.platform}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(world.upcoming_event?.starts_at ?? world.created_at).toLocaleString("ja-JP")}
                </p>
                {world.recurring_schedule ? (
                  <p className="mt-2 text-sm text-slate-300">{world.recurring_schedule}</p>
                ) : null}
              </div>
              <a
                href={world.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
              >
                ワールドを開く
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CreateEventModal({
  worlds,
  onClose,
  onSubmit,
}: {
  worlds: WorldSummary[];
  onClose: () => void;
  onSubmit: (payload: NewCalendarEvent) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [worldId, setWorldId] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !startsAt || !endsAt) {
      return;
    }

    await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      world_id: worldId || null,
      is_public: isPublic,
    });
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Event Create</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">イベントを作成</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="タイトル"
            className={`${inputClass} md:col-span-2`}
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="説明"
            rows={3}
            className={`${inputClass} md:col-span-2`}
          />
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className={inputClass}
          />
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className={inputClass}
          />
          <select
            value={worldId}
            onChange={(event) => setWorldId(event.target.value)}
            className={`${inputClass} md:col-span-2`}
          >
            <option value="">紐づけるワールドなし</option>
            {worlds.map((world) => (
              <option key={world.id} value={world.id}>
                {world.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 md:col-span-2">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
            />
            公開イベントにする
          </label>
          <div className="flex justify-end gap-2 md:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500"
            >
              作成
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
