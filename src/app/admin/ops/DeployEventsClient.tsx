"use client";

import { useCallback, useEffect, useState } from "react";
import { TabDescription } from "./TabDescription";

type DeployEventRow = {
  id: string;
  service: string;
  server_id: string;
  release: string | null;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  duration_seconds: number;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; events: DeployEventRow[] }
  | { kind: "error"; message: string };

const PAGE_SIZE = 50;
const POLL_INTERVAL_MS = 30_000;
const DEFAULT_SERVICE = "rezona-server";

function shortServerId(serverId: string): string {
  if (serverId.length <= 24) return serverId;
  return `${serverId.slice(0, 8)}...${serverId.slice(-12)}`;
}

function formatJst(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function DeployEventsClient() {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [service, setService] = useState(DEFAULT_SERVICE);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "loading" }));
    try {
      const params = new URLSearchParams({
        service,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const res = await fetch(`/api/admin/deploy-events?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        events?: DeployEventRow[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setState({ kind: "ready", events: Array.isArray(json.events) ? json.events : [] });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, [service, offset]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const events = state.kind === "ready" ? state.events : [];
  const isLoading = state.kind === "loading";
  const canGoPrev = offset > 0 && !isLoading;
  const canGoNext = events.length === PAGE_SIZE && !isLoading;

  return (
    <div className="space-y-4">
      <TabDescription>
        rezona-server の warn 以上ログに含まれる
        <code className="mx-1 rounded bg-slate-800 px-1">context.server_id</code>
        の初出を deploy/restart として時系列表示します。
      </TabDescription>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">Deploys</h2>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-400">service</label>
            <select
              value={service}
              onChange={(e) => {
                setService(e.target.value);
                setOffset(0);
              }}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            >
              <option value="rezona-server">rezona-server</option>
            </select>
          </div>
          <span className="text-xs text-slate-500">auto refresh 30s</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
              disabled={!canGoPrev}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:opacity-60"
            >
              Prev
            </button>
            <span className="text-xs tabular-nums text-slate-500">
              {offset + 1}-{offset + events.length}
            </span>
            <button
              type="button"
              onClick={() => setOffset((value) => value + PAGE_SIZE)}
              disabled={!canGoNext}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:opacity-60"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:opacity-60"
            >
              {isLoading ? "読み込み中..." : "再取得"}
            </button>
          </div>
        </header>

        {state.kind === "error" && (
          <p className="border-b border-slate-800 px-4 py-2 text-xs text-red-300">
            エラー: {state.message}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 text-xs text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">service</th>
                <th className="px-2 py-2 text-left font-medium">server_id</th>
                <th className="px-2 py-2 text-left font-medium">release</th>
                <th className="px-2 py-2 text-left font-medium">first_seen (JST)</th>
                <th className="px-2 py-2 text-left font-medium">last_seen (JST)</th>
                <th className="px-2 py-2 text-right font-medium">event_count</th>
                <th className="px-4 py-2 text-right font-medium">duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm text-slate-400">
                    読み込み中...
                  </td>
                </tr>
              )}
              {state.kind === "ready" && events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm text-slate-400">
                    deploy/restart イベントはありません。
                  </td>
                </tr>
              )}
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-2 text-slate-300">{event.service}</td>
                  <td
                    className="px-2 py-2 font-mono text-xs text-slate-200"
                    title={event.server_id}
                  >
                    {shortServerId(event.server_id)}
                  </td>
                  <td
                    className="max-w-xs truncate px-2 py-2 text-slate-300"
                    title={event.release ?? ""}
                  >
                    {event.release ?? "-"}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-slate-300">
                    {formatJst(event.first_seen_at)}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-slate-300">
                    {formatJst(event.last_seen_at)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-300">
                    {event.event_count}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-400">
                    {formatDuration(event.duration_seconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
