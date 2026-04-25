"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TabDescription } from "./TabDescription";

type EventType = "user_action" | "api_request" | "server_event";

type ActivityRow = {
  id: string;
  service: string;
  event_type: EventType;
  action: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

type Summary = { user_id: string; count: number };
type ApiSummary = { action: string; count: number };

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      events: ActivityRow[];
      statsPeriod: string;
      topUsers: Summary[];
      topApis: ApiSummary[];
    }
  | { kind: "error"; message: string };

type PeriodOption = "1h" | "24h" | "7d";
type TypeFilter = "all" | EventType;

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}:${ss}`;
}

function eventTypeBadge(type: EventType): string {
  if (type === "user_action")
    return "bg-sky-500/20 text-sky-300 border-sky-500/30";
  if (type === "api_request")
    return "bg-slate-600/20 text-slate-300 border-slate-500/30";
  return "bg-amber-500/20 text-amber-300 border-amber-500/30";
}

function eventTypeLabel(type: EventType): string {
  if (type === "user_action") return "user";
  if (type === "api_request") return "api";
  return "server";
}

function shortUserId(uid: string | null): string {
  if (!uid) return "—";
  if (uid.length <= 12) return uid;
  return `${uid.slice(0, 8)}…${uid.slice(-3)}`;
}

function statusClass(status: number | undefined): string {
  if (typeof status !== "number") return "text-slate-400";
  if (status >= 500) return "text-red-300";
  if (status >= 400) return "text-amber-300";
  if (status >= 200 && status < 300) return "text-slate-300";
  return "text-slate-400";
}

function metadataSummary(row: ActivityRow): string | null {
  const m = row.metadata ?? {};
  if (row.event_type === "api_request") {
    const status = m.status as number | undefined;
    const duration = m.duration_ms as number | undefined;
    const parts: string[] = [];
    if (typeof status === "number") parts.push(`${status}`);
    if (typeof duration === "number") parts.push(`${duration}ms`);
    return parts.join(" · ") || null;
  }
  if (row.event_type === "server_event") {
    const parts: string[] = [];
    if (typeof m.uptime_sec === "number") parts.push(`uptime=${m.uptime_sec}s`);
    if (typeof m.release === "string") parts.push(`release=${(m.release as string).slice(0, 7)}`);
    if (typeof m.signal === "string") parts.push(`signal=${m.signal}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  // user_action: room_id, reason, etc.
  const parts: string[] = [];
  if (typeof m.world_id === "string") parts.push(`world=${m.world_id}`);
  if (typeof m.reason === "string") parts.push(`reason=${m.reason}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function ActivityClient() {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [period, setPeriod] = useState<PeriodOption>("24h");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [userFilter, setUserFilter] = useState<string>("");

  const fetchData = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams({ statsPeriod: period, limit: "200" });
      if (typeFilter !== "all") params.set("event_type", typeFilter);
      if (userFilter) params.set("user_id", userFilter);
      const res = await fetch(`/api/admin/activity?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        events: ActivityRow[];
        statsPeriod: string;
        topUsers: Summary[];
        topApis: ApiSummary[];
      };
      setState({
        kind: "ready",
        events: json.events,
        statsPeriod: json.statsPeriod,
        topUsers: json.topUsers,
        topApis: json.topApis,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, [period, typeFilter, userFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const events = state.kind === "ready" ? state.events : [];
  const topUsers = state.kind === "ready" ? state.topUsers : [];
  const topApis = state.kind === "ready" ? state.topApis : [];

  const serverEvents = useMemo(
    () => events.filter((e) => e.event_type === "server_event"),
    [events],
  );

  return (
    <div className="space-y-4">
      <TabDescription>
        <strong className="text-slate-200">ユーザー操作・API 呼出・サーバー状態遷移</strong>
        を時系列で 1 画面に統合したログです。30 日分を Supabase `activity_events` に保持。
        <code className="mx-1 rounded bg-slate-800 px-1">server_event</code>
        を timeline で探すと同期ズレ問題の原因となる再起動を特定できます
        （<code className="mx-1 rounded bg-slate-800 px-1">server_boot</code>
        のみで <code className="mx-1 rounded bg-slate-800 px-1">server_stop_graceful</code>
        が直前に無い場合は異常終了）。
      </TabDescription>

      {/* フィルタバー */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs">
          {(["1h", "24h", "7d"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setPeriod(opt)}
              className={`rounded px-2 py-1 transition ${
                period === opt
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs">
          {(["all", "user_action", "api_request", "server_event"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setTypeFilter(opt)}
              className={`rounded px-2 py-1 transition ${
                typeFilter === opt
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt === "all" ? "all" : eventTypeLabel(opt)}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          placeholder="user_id で絞り込み"
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
          style={{ width: 220 }}
        />
        <button
          type="button"
          onClick={fetchData}
          disabled={state.kind === "loading"}
          className="ml-auto rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "loading" ? "読み込み中..." : "再取得"}
        </button>
      </div>

      {state.kind === "error" && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-red-300">
          エラー: {state.message}
        </p>
      )}

      {state.kind === "ready" && serverEvents.length > 0 && (
        <section className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3">
          <h3 className="text-sm font-medium text-amber-200">
            期間内のサーバーイベント ({serverEvents.length} 件)
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            {serverEvents.map((e) => (
              <li key={e.id} className="flex gap-3 font-mono">
                <span className="text-slate-500">{formatAbsolute(e.occurred_at)}</span>
                <span className="text-amber-300">{e.action}</span>
                <span className="text-slate-500">{metadataSummary(e) ?? ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* メイン timeline */}
        <section className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-medium">Timeline ({events.length} 件)</h2>
          </header>
          <div className="max-h-[600px] divide-y divide-slate-800 overflow-y-auto">
            {state.kind === "loading" && (
              <p className="px-4 py-6 text-sm text-slate-400">読み込み中...</p>
            )}
            {state.kind === "ready" && events.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">
                該当イベントがありません（フィルタ条件を緩めるか期間を広げてください）
              </p>
            )}
            {events.map((e) => {
              const status = e.metadata?.status as number | undefined;
              return (
                <article key={e.id} className="px-4 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 ${eventTypeBadge(
                        e.event_type,
                      )}`}
                    >
                      {eventTypeLabel(e.event_type)}
                    </span>
                    <span className="font-mono text-slate-200">{e.action}</span>
                    {typeof status === "number" && (
                      <span className={`tabular-nums ${statusClass(status)}`}>
                        {status}
                      </span>
                    )}
                    <span className="text-slate-500">{metadataSummary(e)}</span>
                    <span className="ml-auto text-slate-500">
                      {formatRelative(e.occurred_at)}
                    </span>
                  </div>
                  {e.user_id && (
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                      user: {shortUserId(e.user_id)}
                      <button
                        type="button"
                        onClick={() => setUserFilter(e.user_id ?? "")}
                        className="ml-2 text-sky-400 hover:underline"
                      >
                        この user で絞り込み
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* 集計サイドバー */}
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-800 bg-slate-900/40">
            <header className="border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-medium">Top ユーザー（期間内）</h3>
            </header>
            <div className="divide-y divide-slate-800">
              {topUsers.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-500">user_action が記録されていません</p>
              ) : (
                topUsers.map((u) => (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => setUserFilter(u.user_id)}
                    className="flex w-full items-center justify-between px-4 py-2 text-xs hover:bg-slate-800/40"
                  >
                    <span className="font-mono text-slate-300">{shortUserId(u.user_id)}</span>
                    <span className="tabular-nums text-slate-500">{u.count}</span>
                  </button>
                ))
              )}
            </div>
          </section>
          <section className="rounded-lg border border-slate-800 bg-slate-900/40">
            <header className="border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-medium">Top API（期間内）</h3>
            </header>
            <div className="divide-y divide-slate-800">
              {topApis.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-500">api_request が記録されていません</p>
              ) : (
                topApis.map((a) => (
                  <div
                    key={a.action}
                    className="flex items-center justify-between px-4 py-2 text-xs"
                  >
                    <span className="font-mono text-slate-300">{a.action}</span>
                    <span className="tabular-nums text-slate-500">{a.count}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
