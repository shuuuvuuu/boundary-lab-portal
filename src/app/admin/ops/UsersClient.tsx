"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TabDescription } from "./TabDescription";

type UsersServiceKey = "rezona";

type LiveKitConn = {
  room: string;
  is_publisher: boolean;
  joined_at: number | null;
};

type SyncState = {
  transport: string;
  last_position_at: number | null;
  position_count_total: number;
};

type UserSnapshot = {
  user_id: string;
  server_id: string;
  socket_count: number;
  socket_ids: string[];
  world_ids: string[];
  connected_at: number | null;
  livekit: LiveKitConn[];
  sync: SyncState;
};

type UsersResponse = {
  server_id: string;
  total_online: number;
  livekit_reachable: boolean;
  livekit_error: string | null;
  users: UserSnapshot[];
};

type ActivityRow = {
  id: string;
  service: string;
  event_type: "user_action" | "api_request" | "server_event";
  action: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

type FetchUsersState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; resp: UsersResponse }
  | { kind: "error"; message: string };

type FetchActivityState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; events: ActivityRow[] }
  | { kind: "error"; message: string };

const REFRESH_INTERVAL_MS = 5_000;

function shortId(id: string, head = 8, tail = 4): string {
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 1_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatTimeOf(iso: string): string {
  const d = new Date(iso);
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}:${ss}`;
}

function eventTypeBadge(type: string): string {
  if (type === "user_action") return "bg-sky-500/20 text-sky-300 border-sky-500/30";
  if (type === "api_request") return "bg-slate-600/20 text-slate-300 border-slate-500/30";
  return "bg-amber-500/20 text-amber-300 border-amber-500/30";
}

/**
 * 位置同期の健全性を判定する。
 *  - active: 直近 10 秒以内に position event が来ている = 同期動作中
 *  - idle: 接続はあるが position が古い (10s〜2min) = ユーザーが操作していない（健全）
 *  - silent: position が 2 分以上来ていない = サイレント切断疑い、要注意
 *  - never: 一度も position event が来ていない = アバター同期未開始
 */
function classifySyncState(sync: SyncState, connectedAt: number | null): {
  level: "active" | "idle" | "silent" | "never";
  label: string;
  className: string;
} {
  const now = Date.now();
  if (!sync.last_position_at) {
    // 接続したばかりなら "never" は健全 (まだ動かしていない)
    if (connectedAt && now - connectedAt < 30_000) {
      return {
        level: "never",
        label: "接続直後 (position 未送信)",
        className: "text-slate-400 border-slate-700 bg-slate-800/30",
      };
    }
    return {
      level: "never",
      label: "⚠️ position event 未到着",
      className: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    };
  }
  const ago = now - sync.last_position_at;
  if (ago < 10_000) {
    return {
      level: "active",
      label: "同期中",
      className: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    };
  }
  if (ago < 120_000) {
    return {
      level: "idle",
      label: "アイドル",
      className: "text-slate-400 border-slate-700 bg-slate-800/30",
    };
  }
  return {
    level: "silent",
    label: "⚠️ サイレント切断疑い",
    className: "text-red-300 border-red-500/40 bg-red-500/10",
  };
}

export function UsersClient() {
  const [usersState, setUsersState] = useState<FetchUsersState>({ kind: "idle" });
  const [activityState, setActivityState] = useState<FetchActivityState>({ kind: "idle" });
  const [selected, setSelected] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [service] = useState<UsersServiceKey>("rezona");

  const fetchUsers = useCallback(async () => {
    setUsersState((prev) => (prev.kind === "ready" ? prev : { kind: "loading" }));
    try {
      const res = await fetch(`/api/admin/metrics/server?service=${service}&type=users`, {
        cache: "no-store",
      });
      if (res.status === 503) {
        const body = (await res.json()) as { configured?: boolean; error?: string };
        if (body.configured === false) {
          setUsersState({
            kind: "error",
            message: `${service} は portal 側で未設定です（${body.error ?? ""}）`,
          });
          return;
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: UsersResponse };
      if (!json.data || !Array.isArray(json.data.users)) {
        throw new Error("レスポンス形式が想定外: data または users が欠落");
      }
      // rezona / boundary の data 形式差を吸収する normalize 層
      // rezona は room_ids / transport flat / sync オブジェクトなし、
      // boundary は world_ids / sync オブジェクト有
      const usersNormalized: UserSnapshot[] = json.data.users.map((u) => {
        const anyU = u as Record<string, unknown>;
        const livekit = Array.isArray(anyU.livekit) ? (anyU.livekit as LiveKitConn[]) : [];
        const worldIds =
          (anyU.world_ids as string[] | undefined) ??
          (anyU.room_ids as string[] | undefined) ??
          [];
        const sync: SyncState =
          (anyU.sync as SyncState | undefined) ?? {
            transport: typeof anyU.transport === "string" ? (anyU.transport as string) : "unknown",
            last_position_at:
              typeof anyU.last_position_at === "number" ? (anyU.last_position_at as number) : null,
            position_count_total:
              typeof anyU.position_count_total === "number"
                ? (anyU.position_count_total as number)
                : 0,
          };
        return {
          user_id: String(anyU.user_id ?? ""),
          server_id: String(anyU.server_id ?? ""),
          socket_count: typeof anyU.socket_count === "number" ? (anyU.socket_count as number) : 0,
          socket_ids: Array.isArray(anyU.socket_ids) ? (anyU.socket_ids as string[]) : [],
          world_ids: worldIds,
          connected_at:
            typeof anyU.connected_at === "number" ? (anyU.connected_at as number) : null,
          livekit,
          sync,
        };
      });
      setUsersState({
        kind: "ready",
        resp: { ...json.data, users: usersNormalized },
      });
    } catch (err) {
      setUsersState({
        kind: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, [service]);

  const fetchActivity = useCallback(async (userId: string) => {
    setActivityState({ kind: "loading" });
    try {
      const params = new URLSearchParams({
        statsPeriod: "24h",
        limit: "50",
        user_id: userId,
      });
      const res = await fetch(`/api/admin/activity?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { events: ActivityRow[] };
      setActivityState({ kind: "ready", events: json.events });
    } catch (err) {
      setActivityState({
        kind: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    if (!autoRefresh) return;
    const t = setInterval(fetchUsers, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [autoRefresh, fetchUsers]);

  useEffect(() => {
    if (selected) fetchActivity(selected);
  }, [selected, fetchActivity]);

  const users = usersState.kind === "ready" ? (usersState.resp.users ?? []) : [];
  const selectedUser = useMemo(
    () => users.find((u) => u.user_id === selected) ?? null,
    [users, selected],
  );
  const events = activityState.kind === "ready" ? activityState.events : [];

  return (
    <div className="space-y-4">
      <TabDescription>
        現在 socket.io / LiveKit に接続中の全ユーザーを 5 秒間隔で表示します。
        各ユーザーについて、接続経路 (websocket / polling)、所属ワールド、
        アバター位置同期の活動状況、LiveKit voice 参加状態、直近 24 時間の Activity
        を確認できます。「sync silent」(2 分以上アバター位置情報が来ない) のラベルが付いた
        ユーザーは、socket は生きているのに実質的に同期していない疑い =
        サイレント切断の早期検知用です。
      </TabDescription>

      {/* 制御バー */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-sky-400"
          />
          5 秒間隔で自動更新
        </label>
        <button
          type="button"
          onClick={fetchUsers}
          disabled={usersState.kind === "loading"}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {usersState.kind === "loading" ? "読み込み中..." : "再取得"}
        </button>
        {usersState.kind === "ready" && (
          <span className="ml-auto">
            online: <span className="text-slate-200">{usersState.resp.total_online}</span>
            {!usersState.resp.livekit_reachable && (
              <span className="ml-2 text-amber-300">
                (LiveKit unreachable: {usersState.resp.livekit_error})
              </span>
            )}
          </span>
        )}
      </div>

      {usersState.kind === "error" && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-red-300">
          エラー: {usersState.message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* 左: ユーザー一覧 */}
        <section className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-3">
            <h3 className="text-sm font-medium">オンラインユーザー</h3>
          </header>
          <div className="divide-y divide-slate-800">
            {usersState.kind === "ready" && users.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">
                現在オンラインのユーザーはいません
              </p>
            )}
            {users.map((u) => {
              const isSelected = u.user_id === selected;
              return (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => setSelected(u.user_id)}
                  className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition ${
                    isSelected ? "bg-slate-800/70" : "hover:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-200">{shortId(u.user_id)}</span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {u.server_id.slice(0, 12)}
                    </span>
                    <span className="ml-auto text-slate-500">
                      {u.connected_at ? formatRelative(u.connected_at) : "—"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                    <span>socket × {u.socket_count}</span>
                    {u.world_ids.length > 0 && (
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 text-emerald-300">
                        world: {u.world_ids.join(", ")}
                      </span>
                    )}
                    {u.livekit.length > 0 && (
                      <span className="rounded border border-pink-500/30 bg-pink-500/10 px-1 text-pink-300">
                        voice × {u.livekit.length}
                      </span>
                    )}
                    {(() => {
                      const c = classifySyncState(u.sync, u.connected_at);
                      return (
                        <span
                          className={`rounded border px-1 ${c.className}`}
                          title={c.label}
                        >
                          sync {c.level}
                        </span>
                      );
                    })()}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 右: 選択ユーザー詳細 */}
        <section className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-3">
            <h3 className="text-sm font-medium">
              {selectedUser
                ? `User Detail: ${shortId(selectedUser.user_id, 12, 6)}`
                : "ユーザーを選択してください"}
            </h3>
          </header>
          <div className="px-4 py-3 space-y-4">
            {selectedUser && (
              <>
                <div className="grid gap-2 text-xs">
                  <div className="flex gap-2">
                    <span className="w-32 text-slate-500">user_id</span>
                    <span className="font-mono text-slate-200 break-all">{selectedUser.user_id}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-32 text-slate-500">server_id</span>
                    <span className="font-mono text-slate-300">{selectedUser.server_id}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-32 text-slate-500">socket count</span>
                    <span className="text-slate-200">{selectedUser.socket_count}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-32 text-slate-500">socket ids</span>
                    <span className="font-mono text-[11px] text-slate-300">
                      {selectedUser.socket_ids.join(", ") || "—"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-32 text-slate-500">worlds</span>
                    <span className="text-slate-200">
                      {selectedUser.world_ids.length > 0
                        ? selectedUser.world_ids.join(", ")
                        : "—"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-32 text-slate-500">connected at</span>
                    <span className="text-slate-300">
                      {selectedUser.connected_at
                        ? `${new Date(selectedUser.connected_at).toLocaleString()} (${formatRelative(selectedUser.connected_at)})`
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* アバター位置同期の状態 */}
                {(() => {
                  const sync = selectedUser.sync;
                  const cls = classifySyncState(sync, selectedUser.connected_at);
                  const lastAgo = sync.last_position_at
                    ? formatRelative(sync.last_position_at)
                    : "—";
                  return (
                    <div>
                      <h4 className="mb-1 text-xs font-medium text-slate-300">
                        アバター位置同期 (socket.io &apos;position&apos; event)
                      </h4>
                      <div
                        className={`rounded border px-3 py-2 text-xs ${cls.className}`}
                      >
                        <div className="font-medium">{cls.label}</div>
                        <div className="mt-1 grid grid-cols-2 gap-y-0.5 text-[11px]">
                          <span className="text-slate-500">transport:</span>
                          <span className="font-mono">{sync.transport}</span>
                          <span className="text-slate-500">last position event:</span>
                          <span className="font-mono">{lastAgo}</span>
                          <span className="text-slate-500">total position events:</span>
                          <span className="font-mono tabular-nums">
                            {sync.position_count_total.toLocaleString()}
                          </span>
                        </div>
                        {cls.level === "never" && sync.last_position_at === null && (
                          <p className="mt-1 text-[10px] opacity-80">
                            socket は接続中 / world にも join 済だが、クライアントから position
                            event が一度も送信されていない。クライアントのアバター送信ロジック未起動 /
                            一時停止の可能性あり。
                          </p>
                        )}
                        {cls.level === "silent" && (
                          <p className="mt-1 text-[10px] opacity-80">
                            2 分以上 position event が来ていない。socket は alive のままだが
                            クライアント側でフリーズ・タブ非アクティブ化・サイレント切断が起きている疑い。
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {selectedUser.livekit.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-slate-300">LiveKit voice</h4>
                    <ul className="space-y-1 text-xs">
                      {selectedUser.livekit.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1"
                        >
                          <span className="font-mono text-slate-200">{c.room}</span>
                          <span
                            className={`rounded border px-1 py-0.5 text-[10px] ${
                              c.is_publisher
                                ? "border-pink-500/40 bg-pink-500/10 text-pink-300"
                                : "border-slate-700 bg-slate-900 text-slate-400"
                            }`}
                          >
                            {c.is_publisher ? "publisher (発話可能)" : "subscriber (聞き専)"}
                          </span>
                          <span className="ml-auto text-slate-500">
                            {c.joined_at
                              ? formatRelative(c.joined_at * 1000)
                              : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Activity 履歴 */}
                <div>
                  <h4 className="mb-1 text-xs font-medium text-slate-300">
                    直近 Activity (24h)
                  </h4>
                  {activityState.kind === "loading" && (
                    <p className="py-4 text-xs text-slate-400">読み込み中...</p>
                  )}
                  {activityState.kind === "error" && (
                    <p className="py-4 text-xs text-red-300">
                      エラー: {activityState.message}
                    </p>
                  )}
                  {activityState.kind === "ready" && events.length === 0 && (
                    <p className="py-4 text-xs text-slate-400">
                      24h 内にこのユーザーの Activity はありません
                    </p>
                  )}
                  {activityState.kind === "ready" && events.length > 0 && (
                    <ul className="max-h-72 space-y-1 overflow-y-auto text-[11px]">
                      {events.map((e) => {
                        const status = e.metadata?.status as number | undefined;
                        const dur = e.metadata?.duration_ms as number | undefined;
                        return (
                          <li
                            key={e.id}
                            className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1"
                          >
                            <span className="text-slate-500">{formatTimeOf(e.occurred_at)}</span>
                            <span
                              className={`inline-block rounded border px-1 py-0.5 text-[10px] ${eventTypeBadge(e.event_type)}`}
                            >
                              {e.event_type}
                            </span>
                            <span className="font-mono text-slate-200">{e.action}</span>
                            {typeof status === "number" && (
                              <span className="tabular-nums text-slate-400">{status}</span>
                            )}
                            {typeof dur === "number" && (
                              <span className="tabular-nums text-slate-500">{dur}ms</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
