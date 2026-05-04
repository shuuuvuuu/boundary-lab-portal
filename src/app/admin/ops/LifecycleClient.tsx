"use client";

import { useCallback, useEffect, useState } from "react";

import { TabDescription } from "./TabDescription";

type LifecycleService = "all" | "rezona" | "portal" | "boundary";
type PairStatus = "normal" | "abnormal" | "running";
type BootRow = {
  id: string;
  service: string;
  timestamp: string;
  server_id: string;
  release: string | null;
  event: string;
  paired_at: string | null;
  elapsed_ms: number;
  pair_status: PairStatus;
};
type FetchState =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; rows: BootRow[]; note: string | null }
  | { kind: "error"; message: string };

const SERVICES: LifecycleService[] = ["all", "rezona", "portal", "boundary"];

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}:${pad2(d.getSeconds())}`;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function shortId(id: string): string {
  return id.length <= 18 ? id : `${id.slice(0, 10)}…${id.slice(-5)}`;
}

function statusClass(status: PairStatus): string {
  if (status === "normal") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "abnormal") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function statusLabel(status: PairStatus): string {
  if (status === "normal") return "正常終了";
  if (status === "abnormal") return "⚠️ 異常終了";
  return "進行中";
}

export function LifecycleClient({ fixedService }: { fixedService?: LifecycleService }) {
  const [service, setService] = useState<LifecycleService>(fixedService ?? "all");
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const activeService = fixedService ?? service;

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams({ service: activeService });
      const res = await fetch(`/api/admin/lifecycle/boot-history?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        rows?: BootRow[];
        note?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState({
        kind: "ready",
        rows: Array.isArray(json.rows) ? json.rows : [],
        note: json.note ?? null,
      });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "unknown error" });
    }
  }, [activeService]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = state.kind === "ready" ? state.rows : [];
  const counts = {
    normal: rows.filter((row) => row.pair_status === "normal").length,
    abnormal: rows.filter((row) => row.pair_status === "abnormal").length,
    running: rows.filter((row) => row.pair_status === "running").length,
  };

  return (
    <div className="space-y-4">
      <TabDescription>
        直近 24h の server_boot / server_stop_graceful を service・server_id ごとにペア判定します。
        boot の後に graceful stop が無いまま次の boot が来た場合は異常終了として扱います。
      </TabDescription>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">Boot lifecycle</h2>
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
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
              normal {counts.normal}
            </span>
            <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300">
              abnormal {counts.abnormal}
            </span>
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300">
              running {counts.running}
            </span>
          </div>
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
        {state.kind === "ready" && state.note && (
          <p className="border-b border-slate-800 px-4 py-2 text-xs text-amber-300">{state.note}</p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-800 text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">timestamp</th>
                <th className="px-2 py-2 text-left font-medium">server_id</th>
                <th className="px-2 py-2 text-left font-medium">release</th>
                <th className="px-2 py-2 text-left font-medium">event</th>
                <th className="px-2 py-2 text-right font-medium">経過時間</th>
                <th className="px-4 py-2 text-left font-medium">pair status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {state.kind === "loading" && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-sm text-slate-400">
                    読み込み中...
                  </td>
                </tr>
              )}
              {state.kind === "ready" && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-sm text-slate-400">
                    直近 24h の boot 履歴はありません。
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-slate-300">
                    {formatTime(row.timestamp)}
                  </td>
                  <td className="px-2 py-2 font-mono text-slate-300" title={row.server_id}>
                    {shortId(row.server_id)}
                  </td>
                  <td className="px-2 py-2 font-mono text-slate-400">
                    {row.release ? shortId(row.release) : "-"}
                  </td>
                  <td className="px-2 py-2 font-mono text-slate-300">{row.event}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-slate-300">
                    {formatDuration(row.elapsed_ms)}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded border px-2 py-1 ${statusClass(row.pair_status)}`}>
                      {statusLabel(row.pair_status)}
                    </span>
                    {row.paired_at && (
                      <span className="ml-2 font-mono text-slate-500">
                        until {formatTime(row.paired_at)}
                      </span>
                    )}
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
