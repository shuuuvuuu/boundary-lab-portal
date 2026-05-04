"use client";

import { useCallback, useEffect, useState } from "react";

import { TabDescription } from "./TabDescription";

type LifecycleService = "all" | "rezona" | "portal" | "boundary";
type JoinRow = {
  user_id: string;
  count: number;
  services: string[];
  rooms: string[];
  last_join_at: string;
};
type FetchState =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; rows: JoinRow[]; totalUsers: number; totalJoins: number }
  | { kind: "error"; message: string };

const SERVICES: LifecycleService[] = ["all", "rezona", "portal", "boundary"];

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function shortUser(id: string): string {
  return id.length <= 18 ? id : `${id.slice(0, 10)}…${id.slice(-5)}`;
}

export function JoinFrequencyClient({ fixedService }: { fixedService?: LifecycleService }) {
  const [service, setService] = useState<LifecycleService>(fixedService ?? "all");
  const [threshold, setThreshold] = useState(5);
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const activeService = fixedService ?? service;

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams({
        service: activeService,
        threshold: String(threshold),
      });
      const res = await fetch(`/api/admin/lifecycle/join-frequency?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        rows?: JoinRow[];
        totalUsers?: number;
        totalJoins?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState({
        kind: "ready",
        rows: Array.isArray(json.rows) ? json.rows : [],
        totalUsers: typeof json.totalUsers === "number" ? json.totalUsers : 0,
        totalJoins: typeof json.totalJoins === "number" ? json.totalJoins : 0,
      });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "unknown error" });
    }
  }, [activeService, threshold]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = state.kind === "ready" ? state.rows : [];

  return (
    <div className="space-y-4">
      <TabDescription>
        直近 1h の room_join を user_id 別に集計します。visibilitychange 由来の strong join
        リトライや再入室ノイズの入口として、閾値以上のユーザーだけを top 10 表示します。
      </TabDescription>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">Join frequency</h2>
          {!fixedService && (
            <select
              value={service}
              onChange={(e) => setService(e.target.value as LifecycleService)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100"
            >
              {SERVICES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-400">
            threshold
            <input
              type="number"
              min={1}
              max={50}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-right text-slate-100"
            />
          </label>
          {state.kind === "ready" && (
            <span className="text-xs text-slate-500">
              {state.totalJoins} joins / {state.totalUsers} users
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={state.kind === "loading"}
            className="ml-auto rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === "loading" ? "読み込み中..." : "再取得"}
          </button>
        </header>
        {state.kind === "error" && (
          <p className="px-4 py-6 text-sm text-red-300">エラー: {state.message}</p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-800 text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">user_id</th>
                <th className="px-2 py-2 text-right font-medium">joins</th>
                <th className="px-2 py-2 text-left font-medium">services</th>
                <th className="px-2 py-2 text-left font-medium">rooms</th>
                <th className="px-4 py-2 text-right font-medium">last</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {state.kind === "loading" && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-sm text-slate-400">
                    読み込み中...
                  </td>
                </tr>
              )}
              {state.kind === "ready" && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-sm text-slate-400">
                    閾値以上の再入室頻度はありません。
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.user_id}>
                  <td className="px-4 py-2 font-mono text-slate-300" title={row.user_id}>
                    {shortUser(row.user_id)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-amber-300">
                    {row.count}
                  </td>
                  <td className="px-2 py-2 font-mono text-slate-400">
                    {row.services.join(", ") || "-"}
                  </td>
                  <td className="px-2 py-2 font-mono text-slate-400">
                    {row.rooms.join(", ") || "-"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-slate-500">
                    {formatTime(row.last_join_at)}
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
