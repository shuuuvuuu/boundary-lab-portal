"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TabDescription } from "./TabDescription";

type LifecycleService = "all" | "rezona" | "portal" | "boundary";
type SpikeRow = { bucket: number; count: number; threshold: number; spike: boolean };
type SpikeLog = {
  bucket: number;
  count: number;
  logs: Array<{
    id: string;
    source: string;
    level: string;
    message: string;
    context: unknown;
    occurred_at: string;
  }>;
};
type FetchState =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; rows: SpikeRow[]; spikeLogs: SpikeLog[]; threshold: number; total: number }
  | { kind: "error"; message: string };

const SERVICES: LifecycleService[] = ["all", "rezona", "portal", "boundary"];

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatBucket(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}:${pad2(d.getSeconds())}`;
}

export function ReconnectSpikesClient({ fixedService }: { fixedService?: LifecycleService }) {
  const [service, setService] = useState<LifecycleService>(fixedService ?? "all");
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const activeService = fixedService ?? service;

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams({ service: activeService });
      const res = await fetch(`/api/admin/lifecycle/reconnect-spikes?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        rows?: SpikeRow[];
        spikeLogs?: SpikeLog[];
        threshold?: number;
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState({
        kind: "ready",
        rows: Array.isArray(json.rows) ? json.rows : [],
        spikeLogs: Array.isArray(json.spikeLogs) ? json.spikeLogs : [],
        threshold: typeof json.threshold === "number" ? json.threshold : 0,
        total: typeof json.total === "number" ? json.total : 0,
      });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "unknown error" });
    }
  }, [activeService]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = state.kind === "ready" ? state.rows : [];
  const spikeLogs = state.kind === "ready" ? state.spikeLogs : [];

  return (
    <div className="space-y-4">
      <TabDescription>
        service_logs の socket.reconnect.in_grace を 5 分粒度で集計し、中央値 + 3σ を超えた bucket
        を spike として表示します。
      </TabDescription>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">Reconnect spike</h2>
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
          {state.kind === "ready" && (
            <span
              className={`rounded border px-2 py-1 text-xs ${
                spikeLogs.length > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {spikeLogs.length > 0 ? `⚠️ spike ${spikeLogs.length}` : "spike 0"} / total{" "}
              {state.total}
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
        <div className="px-2 py-3" style={{ height: 260 }}>
          {state.kind === "loading" && rows.length === 0 ? (
            <p className="px-2 py-6 text-sm text-slate-400">読み込み中...</p>
          ) : rows.length === 0 ? (
            <p className="px-2 py-6 text-sm text-slate-400">
              直近 24h の reconnect grace ログはありません。
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value: number) => formatBucket(value)}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  stroke="#334155"
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  stroke="#334155"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    fontSize: 11,
                  }}
                  labelFormatter={(value) => formatBucket(Number(value))}
                  formatter={(value, name) =>
                    name === "threshold" ? Number(value).toFixed(2) : Number(value).toLocaleString()
                  }
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#facc15"
                  strokeWidth={1.7}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="threshold"
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {spikeLogs.length > 0 && (
        <section className="rounded-lg border border-amber-900/50 bg-amber-950/20">
          <header className="border-b border-amber-900/40 px-4 py-3">
            <h3 className="text-sm font-medium text-amber-200">Spike logs</h3>
          </header>
          <div className="divide-y divide-amber-900/30">
            {spikeLogs.map((bucket) => (
              <div key={bucket.bucket} className="px-4 py-3">
                <div className="text-xs font-mono text-amber-200">
                  {formatBucket(bucket.bucket)} / {bucket.count} logs
                </div>
                <div className="mt-2 space-y-2">
                  {bucket.logs.map((log) => (
                    <article
                      key={log.id}
                      className="rounded border border-slate-800 bg-slate-950/50 p-2 text-xs"
                    >
                      <div className="flex flex-wrap gap-2 text-slate-400">
                        <span className="font-mono text-slate-300">
                          {formatTime(log.occurred_at)}
                        </span>
                        <span>{log.source}</span>
                        <span>{log.level}</span>
                      </div>
                      <div className="mt-1 text-slate-200">{log.message}</div>
                      <pre className="mt-1 max-h-36 overflow-auto rounded bg-slate-950 p-2 text-slate-500">
                        {JSON.stringify(log.context, null, 2)}
                      </pre>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
