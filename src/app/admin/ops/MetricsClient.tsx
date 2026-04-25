"use client";

import { useEffect, useMemo, useState } from "react";
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

type ResourceSample = {
  ts: number;
  memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  cpuPct: number;
  eventLoopLagMs: { p50: number; p99: number; max: number };
};

type ServerMetrics = {
  windowSamples: number;
  intervalMs: number;
  samples: ResourceSample[];
  current: ResourceSample | null;
  uptime_sec: number;
};

type RoomSnapshot = {
  id: string;
  socket_players: number;
  socket_user_ids: string[];
  livekit_participants: number | null;
  livekit_publishers: number | null;
  livekit_age_sec: number | null;
};

type RoomsMetrics = {
  socket_total_connections: number;
  livekit_reachable: boolean;
  livekit_error: string | null;
  rooms: RoomSnapshot[];
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; server: ServerMetrics | null; rooms: RoomsMetrics | null }
  | { kind: "error"; message: string };

const REFRESH_INTERVAL_MS = 5_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return `${d}d ${h}h`;
}

function formatTimeLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function memoryColorClass(rssBytes: number): string {
  const mb = rssBytes / 1024 / 1024;
  if (mb >= 1024) return "text-red-300"; // 1GB+
  if (mb >= 512) return "text-amber-300"; // 512MB+
  return "text-slate-100";
}

function lagColorClass(p99: number): string {
  if (p99 >= 100) return "text-red-300";
  if (p99 >= 30) return "text-amber-300";
  return "text-slate-100";
}

export function MetricsClient() {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAll = async (): Promise<void> => {
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "loading" }));
    try {
      const res = await fetch("/api/admin/metrics/server?type=all", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        type: string;
        server?: ServerMetrics;
        rooms?: RoomsMetrics;
      };
      setState({
        kind: "ready",
        server: json.server ?? null,
        rooms: json.rooms ?? null,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  };

  useEffect(() => {
    fetchAll();
    if (!autoRefresh) return;
    const t = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const memoryChartData = useMemo(() => {
    if (state.kind !== "ready" || !state.server) return [];
    return state.server.samples.map((s) => ({
      ts: s.ts,
      rss: Math.round(s.memory.rss / 1024 / 1024),
      heapUsed: Math.round(s.memory.heapUsed / 1024 / 1024),
    }));
  }, [state]);

  const cpuChartData = useMemo(() => {
    if (state.kind !== "ready" || !state.server) return [];
    return state.server.samples.map((s) => ({
      ts: s.ts,
      cpu: s.cpuPct,
    }));
  }, [state]);

  const lagChartData = useMemo(() => {
    if (state.kind !== "ready" || !state.server) return [];
    return state.server.samples.map((s) => ({
      ts: s.ts,
      p50: s.eventLoopLagMs.p50,
      p99: s.eventLoopLagMs.p99,
    }));
  }, [state]);

  const server = state.kind === "ready" ? state.server : null;
  const rooms = state.kind === "ready" ? state.rooms : null;
  const current = server?.current;

  return (
    <div className="space-y-4">
      <TabDescription>
        boundary-server プロセスの<strong className="text-slate-200">
          メモリ・CPU・event loop lag
        </strong>
        を 1 秒間隔・直近 60 秒で表示します。{" "}
        <strong className="text-slate-200">ルーム別の socket / LiveKit 参加者数</strong>
        も同時表示。OOM 前兆 (memory じわ漏れ) や socket.io 詰まり (event loop lag spike) を
        異常 boot 前に検知することが目的です。5 秒間隔で自動再取得。
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
          onClick={fetchAll}
          disabled={state.kind === "loading"}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "loading" ? "読み込み中..." : "再取得"}
        </button>
        {server && (
          <span className="ml-auto">
            uptime: <span className="text-slate-200">{formatUptime(server.uptime_sec)}</span>
          </span>
        )}
      </div>

      {state.kind === "error" && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-red-300">
          エラー: {state.message}
        </p>
      )}

      {/* 現在値カード */}
      {current && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="text-xs text-slate-400">RSS Memory</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${memoryColorClass(current.memory.rss)}`}>
              {formatBytes(current.memory.rss)}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              heap {formatBytes(current.memory.heapUsed)} / {formatBytes(current.memory.heapTotal)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="text-xs text-slate-400">CPU</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
              {current.cpuPct.toFixed(1)}%
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              1 秒あたり (multi-core で 100%超可)
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="text-xs text-slate-400">Event loop lag (p99)</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${lagColorClass(current.eventLoopLagMs.p99)}`}>
              {current.eventLoopLagMs.p99.toFixed(1)}ms
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              p50 {current.eventLoopLagMs.p50.toFixed(1)}ms · max {current.eventLoopLagMs.max.toFixed(1)}ms
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="text-xs text-slate-400">Socket connections</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
              {rooms?.socket_total_connections ?? "—"}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              {rooms?.livekit_reachable === false
                ? `LiveKit unreachable: ${rooms?.livekit_error ?? ""}`
                : `LiveKit OK · ルーム ${rooms?.rooms.length ?? 0}`}
            </div>
          </div>
        </div>
      )}

      {/* 時系列グラフ x3 */}
      {server && server.samples.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Memory (MB)" data={memoryChartData} keys={["rss", "heapUsed"]} colors={["#60a5fa", "#34d399"]} unit="MB" />
          <ChartCard title="CPU (%)" data={cpuChartData} keys={["cpu"]} colors={["#fbbf24"]} unit="%" />
          <ChartCard title="Event loop lag (ms)" data={lagChartData} keys={["p50", "p99"]} colors={["#94a3b8", "#f87171"]} unit="ms" />
        </div>
      )}

      {/* Room dashboard */}
      {rooms && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-3">
            <h3 className="text-sm font-medium">Rooms ({rooms.rooms.length})</h3>
            {!rooms.livekit_reachable && (
              <p className="mt-1 text-xs text-amber-300">
                LiveKit unreachable: {rooms.livekit_error}
              </p>
            )}
          </header>
          {rooms.rooms.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">
              現在アクティブなルームはありません
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Room ID</th>
                  <th className="px-2 py-2 text-right font-medium">Socket players</th>
                  <th className="px-2 py-2 text-right font-medium">LiveKit participants</th>
                  <th className="px-2 py-2 text-right font-medium">LiveKit publishers</th>
                  <th className="px-4 py-2 text-right font-medium">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rooms.rooms.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-mono text-slate-200">{r.id}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300">
                      {r.socket_players}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300">
                      {r.livekit_participants ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300">
                      {r.livekit_publishers ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {r.livekit_age_sec !== null ? formatUptime(r.livekit_age_sec) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

function ChartCard({
  title,
  data,
  keys,
  colors,
  unit,
}: {
  title: string;
  data: Array<Record<string, number>>;
  keys: string[];
  colors: string[];
  unit: string;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 px-3 py-2">
        <h4 className="text-xs font-medium text-slate-200">{title}</h4>
      </header>
      <div className="px-1 py-2" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="ts"
              tickFormatter={(t: number) => formatTimeLabel(t)}
              tick={{ fill: "#64748b", fontSize: 9 }}
              stroke="#334155"
              minTickGap={30}
            />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} stroke="#334155" />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
              labelFormatter={(t) => formatTimeLabel(Number(t))}
              formatter={(value) => `${Number(value).toFixed(1)}${unit}`}
            />
            {keys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={colors[i] ?? "#94a3b8"}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
