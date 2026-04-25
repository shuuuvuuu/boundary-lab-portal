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

import type { SentryServiceKey } from "./IssuesClient";
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

type HostSnapshot = {
  ts: number;
  memory: {
    total_kb: number;
    free_kb: number;
    available_kb: number;
    buffers_kb: number;
    cached_kb: number;
    used_kb: number;
    used_pct: number;
  };
  swap: { total_kb: number; free_kb: number; used_kb: number; used_pct: number };
  load: { avg_1: number; avg_5: number; avg_15: number; runnable: number; total_threads: number };
  cpu: { cores: number; overall_pct: number; iowait_pct: number };
  disk: { root_gb: number; root_used_gb: number; root_used_pct: number };
  network: { rx_bytes: number; tx_bytes: number; iface_name: string };
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      server: ServerMetrics | null;
      rooms: RoomsMetrics | null;
      host: HostSnapshot | null;
    }
  | { kind: "error"; message: string };

type RefreshOption = "5s" | "60s" | "1h" | "24h" | "off";

const REFRESH_INTERVAL_MAP: Record<Exclude<RefreshOption, "off">, number> = {
  "5s": 5_000,
  "60s": 60_000,
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

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
  const [refresh, setRefresh] = useState<RefreshOption>("5s");
  const [service, setService] = useState<SentryServiceKey>("boundary");

  const fetchAll = async (): Promise<void> => {
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "loading" }));
    try {
      const res = await fetch(`/api/admin/metrics/server?service=${service}&type=all`, {
        cache: "no-store",
      });
      // 503 + configured: false は「未設定」として明示メッセージで扱う
      if (res.status === 503) {
        const body = (await res.json()) as { configured?: boolean; error?: string };
        if (body.configured === false) {
          setState({
            kind: "error",
            message: `${service} は portal 側で未設定です（${body.error ?? "REZONA_INTERNAL_URL / REZONA_INTERNAL_SECRET を /etc/boundary/.env に追加してください"}）`,
          });
          return;
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        type: string;
        server?: ServerMetrics;
        rooms?: RoomsMetrics;
        host?: HostSnapshot;
      };
      setState({
        kind: "ready",
        server: json.server ?? null,
        rooms: json.rooms ?? null,
        host: json.host ?? null,
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
    if (refresh === "off") return;
    const intervalMs = REFRESH_INTERVAL_MAP[refresh];
    const t = setInterval(fetchAll, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, service]);

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
  const host = state.kind === "ready" ? state.host : null;
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
        異常 boot 前に検知することが目的です。データ保持窓は server 側 60 秒固定で、
        更新間隔は表示の頻度のみ変更します（5s / 60s / 1h / 24h / off）。
      </TabDescription>

      {/* 制御バー */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>service:</span>
        <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5">
          {(["boundary", "rezona"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setService(s)}
              className={`rounded px-2 py-1 transition ${
                service === s
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span>更新間隔:</span>
        <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5">
          {(["5s", "60s", "1h", "24h", "off"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setRefresh(opt)}
              className={`rounded px-2 py-1 transition ${
                refresh === opt
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title={
                opt === "off"
                  ? "自動更新オフ。手動で再取得ボタンを押した時のみ取得"
                  : opt === "5s"
                    ? "リアルタイム監視向け（推奨）"
                    : opt === "60s"
                      ? "1 分置き。タブを開きっぱなしにしておく時"
                      : opt === "1h"
                        ? "1 時間置き。常時開きっぱなし時の負荷削減"
                        : "24 時間置き。事実上手動相当（boundary-server のメモリ保持窓は 60 秒固定）"
              }
            >
              {opt}
            </button>
          ))}
        </div>
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

      {/* Host (Droplet) 全体 */}
      {host && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-2">
            <h3 className="text-sm font-medium text-slate-200">
              Droplet host (全コンテナ合算)
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              boundary-server / portal / livekit / caddy / app / etc. 全部の合算。
              boundary-server プロセス単独の値は下のセクションで確認。
            </p>
          </header>
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <HostCard
              label="Memory"
              primary={`${(host.memory.used_kb / 1024 / 1024).toFixed(2)}GB`}
              secondary={`/ ${(host.memory.total_kb / 1024 / 1024).toFixed(1)}GB (${host.memory.used_pct}%)`}
              colorClass={
                host.memory.used_pct >= 85
                  ? "text-red-300"
                  : host.memory.used_pct >= 70
                    ? "text-amber-300"
                    : "text-slate-100"
              }
            />
            <HostCard
              label="Swap"
              primary={`${(host.swap.used_kb / 1024).toFixed(0)}MB`}
              secondary={`/ ${(host.swap.total_kb / 1024 / 1024).toFixed(1)}GB (${host.swap.used_pct}%)`}
              colorClass={
                host.swap.used_pct >= 50
                  ? "text-red-300"
                  : host.swap.used_pct >= 5
                    ? "text-amber-300"
                    : "text-slate-100"
              }
              hint={
                host.swap.used_pct > 5
                  ? "swap が使われ始めている = 物理メモリ枯渇の前兆"
                  : "swap 未使用 = 健全"
              }
            />
            <HostCard
              label="Load avg (1/5/15)"
              primary={`${host.load.avg_1.toFixed(2)}`}
              secondary={`${host.load.avg_5.toFixed(2)} / ${host.load.avg_15.toFixed(2)} · ${host.cpu.cores} cores`}
              colorClass={
                host.load.avg_1 / host.cpu.cores >= 2
                  ? "text-red-300"
                  : host.load.avg_1 / host.cpu.cores >= 1
                    ? "text-amber-300"
                    : "text-slate-100"
              }
              hint={`load > cores (${host.cpu.cores}) = CPU 飽和`}
            />
            <HostCard
              label="Disk (/)"
              primary={`${host.disk.root_used_gb.toFixed(1)}GB`}
              secondary={`/ ${host.disk.root_gb.toFixed(0)}GB (${host.disk.root_used_pct}%)`}
              colorClass={
                host.disk.root_used_pct >= 85
                  ? "text-red-300"
                  : host.disk.root_used_pct >= 70
                    ? "text-amber-300"
                    : "text-slate-100"
              }
            />
            <HostCard
              label="CPU (host total)"
              primary={
                host.cpu.overall_pct < 0
                  ? "—"
                  : `${host.cpu.overall_pct.toFixed(1)}%`
              }
              secondary={
                host.cpu.iowait_pct < 0
                  ? "iowait —"
                  : `iowait ${host.cpu.iowait_pct.toFixed(1)}%`
              }
              colorClass={
                host.cpu.overall_pct >= 80
                  ? "text-red-300"
                  : host.cpu.overall_pct >= 60
                    ? "text-amber-300"
                    : "text-slate-100"
              }
              hint="2 回目以降の取得で値が出る。iowait 高 = ディスク I/O ボトルネック"
            />
            <HostCard
              label="Threads (run/total)"
              primary={`${host.load.runnable}`}
              secondary={`/ ${host.load.total_threads}`}
              colorClass="text-slate-100"
              hint="runnable = 現在 CPU を待っているスレッド数"
            />
            <HostCard
              label={`Network (${host.network.iface_name})`}
              primary={`rx ${(host.network.rx_bytes / 1024 / 1024).toFixed(0)}MB`}
              secondary={`tx ${(host.network.tx_bytes / 1024 / 1024).toFixed(0)}MB`}
              colorClass="text-slate-100"
              hint="container 内 eth0 = Docker bridge 経由の累計 (host eth0 ではない)"
            />
            <HostCard
              label="Memory breakdown"
              primary={`${(host.memory.cached_kb / 1024 / 1024).toFixed(2)}GB`}
              secondary={`cache · ${(host.memory.buffers_kb / 1024 / 1024).toFixed(2)}GB buffer`}
              colorClass="text-slate-100"
              hint="cache/buffer は OS が後で解放可能なため used に見えても危険ではない"
            />
          </div>
        </section>
      )}

      {/* boundary-server プロセス単独 */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="border-b border-slate-800 px-4 py-2">
          <h3 className="text-sm font-medium text-slate-200">
            boundary-server プロセス単独
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            host 全体ではなく、Node.js プロセスの内訳。直近 60 秒の時系列付き。
          </p>
        </header>
        <div className="px-4 py-3 space-y-4">
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
        </div>
      </section>

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

function HostCard({
  label,
  primary,
  secondary,
  colorClass,
  hint,
}: {
  label: string;
  primary: string;
  secondary: string;
  colorClass: string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2" title={hint}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${colorClass}`}>{primary}</div>
      <div className="text-[10px] text-slate-400">{secondary}</div>
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
