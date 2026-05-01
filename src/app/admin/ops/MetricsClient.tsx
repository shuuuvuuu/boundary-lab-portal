"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type MetricsServiceKey = "rezona";
type HistoryPeriod = "1h" | "24h" | "7d" | "30d";
type MetricsMode = "live" | HistoryPeriod;
type HistoryKind = "process" | "rooms" | "users";
type JsonObject = Record<string, unknown>;

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

type HistoryMetricRow = {
  id: string;
  service: string;
  server_id: string | null;
  kind: HistoryKind;
  captured_at: string;
  data: unknown;
};

type HistoryRows = {
  process: HistoryMetricRow[];
  rooms: HistoryMetricRow[];
  users: HistoryMetricRow[];
};

type FetchState =
  | { kind: "idle"; mode: MetricsMode }
  | { kind: "loading"; mode: MetricsMode }
  | {
      kind: "live-ready";
      server: ServerMetrics | null;
      rooms: RoomsMetrics | null;
      host: HostSnapshot | null;
    }
  | {
      kind: "history-ready";
      mode: HistoryPeriod;
      service: string;
      rows: HistoryRows;
    }
  | { kind: "error"; mode: MetricsMode; message: string };

type RefreshOption = "5s" | "60s" | "1h" | "24h" | "off";

const REFRESH_INTERVAL_MAP: Record<Exclude<RefreshOption, "off">, number> = {
  "5s": 5_000,
  "60s": 60_000,
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

const MODE_OPTIONS: MetricsMode[] = ["live", "1h", "24h", "7d", "30d"];
const HISTORY_SERVICE_MAP: Record<MetricsServiceKey, string> = {
  rezona: "rezona-server",
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

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatTimeLabel(ms: number, period?: HistoryPeriod): string {
  const d = new Date(ms);
  if (period === "7d" || period === "30d") {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  if (period === "1h" || period === "24h") {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
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

function asRecord(value: unknown): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coerceResourceSample(value: unknown): ResourceSample | null {
  const record = asRecord(value);
  const memory = asRecord(record?.memory);
  const eventLoopLagMs = asRecord(record?.eventLoopLagMs);
  if (!record || !memory || !eventLoopLagMs) return null;

  const ts = asNumber(record.ts);
  const rss = asNumber(memory.rss);
  const heapUsed = asNumber(memory.heapUsed);
  const cpuPct = asNumber(record.cpuPct);
  const p99 = asNumber(eventLoopLagMs.p99);
  if (ts === null || rss === null || heapUsed === null || cpuPct === null || p99 === null) {
    return null;
  }

  return {
    ts,
    memory: {
      rss,
      heapUsed,
      heapTotal: asNumber(memory.heapTotal) ?? 0,
      external: asNumber(memory.external) ?? 0,
    },
    cpuPct,
    eventLoopLagMs: {
      p50: asNumber(eventLoopLagMs.p50) ?? 0,
      p99,
      max: asNumber(eventLoopLagMs.max) ?? p99,
    },
  };
}

function extractResourceSample(data: unknown): ResourceSample | null {
  const direct = coerceResourceSample(data);
  if (direct) return direct;

  const record = asRecord(data);
  if (!record) return null;

  const current = coerceResourceSample(record.current);
  if (current) return current;

  if (Array.isArray(record.samples)) {
    for (let i = record.samples.length - 1; i >= 0; i -= 1) {
      const sample = coerceResourceSample(record.samples[i]);
      if (sample) return sample;
    }
  }

  return null;
}

function extractCapturedAt(row: HistoryMetricRow): number | null {
  const capturedAt = Date.parse(row.captured_at);
  return Number.isNaN(capturedAt) ? null : capturedAt;
}

function extractRoomTotals(data: unknown): {
  socket_total_connections: number;
  livekit_publishers: number;
} | null {
  const record = asRecord(data);
  if (!record) return null;

  const socketTotal = asNumber(record.socket_total_connections) ?? 0;
  const rooms = Array.isArray(record.rooms) ? record.rooms : [];
  const publishers = rooms.reduce((sum, room) => {
    const roomRecord = asRecord(room);
    return sum + (asNumber(roomRecord?.livekit_publishers) ?? 0);
  }, 0);

  return {
    socket_total_connections: socketTotal,
    livekit_publishers: publishers,
  };
}

async function fetchHistoryRows(
  service: string,
  kind: HistoryKind,
  period: HistoryPeriod,
): Promise<HistoryMetricRow[]> {
  const params = new URLSearchParams({
    service,
    kind,
    period,
    limit: "10000",
  });
  const res = await fetch(`/api/admin/metrics/history?${params.toString()}`, {
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    rows?: HistoryMetricRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return Array.isArray(json.rows) ? json.rows : [];
}

export function MetricsClient() {
  const [state, setState] = useState<FetchState>({ kind: "idle", mode: "live" });
  const [refresh, setRefresh] = useState<RefreshOption>("5s");
  const [mode, setMode] = useState<MetricsMode>("live");
  const [service] = useState<MetricsServiceKey>("rezona");
  const requestSeq = useRef(0);

  const fetchAll = useCallback(async (): Promise<void> => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setState((prev) => (prev.kind === "live-ready" ? prev : { kind: "loading", mode: "live" }));
    try {
      const res = await fetch(`/api/admin/metrics/server?service=${service}&type=all`, {
        cache: "no-store",
      });
      // 503 + configured: false は「未設定」として明示メッセージで扱う
      if (res.status === 503) {
        const body = (await res.json()) as { configured?: boolean; error?: string };
        if (body.configured === false) {
          if (requestSeq.current !== seq) return;
          setState({
            kind: "error",
            mode: "live",
            message: `${service} は portal 側で未設定です（${body.error ?? "REZONA_INTERNAL_URL / REZONA_INTERNAL_SECRET を /etc/boundary/.env に追加してください"}）`,
          });
          return;
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        type: string;
        // boundary 旧形式: top-level に server/rooms/host
        server?: ServerMetrics;
        rooms?: RoomsMetrics;
        host?: HostSnapshot;
        // rezona Phase 3c 形式: { type, server_id, data: { server, rooms, users } }
        data?: {
          server?: ServerMetrics;
          rooms?: RoomsMetrics;
          host?: HostSnapshot;
        };
      };
      if (requestSeq.current !== seq) return;
      setState({
        kind: "live-ready",
        server: json.server ?? json.data?.server ?? null,
        rooms: json.rooms ?? json.data?.rooms ?? null,
        host: json.host ?? json.data?.host ?? null,
      });
    } catch (err) {
      if (requestSeq.current !== seq) return;
      setState({
        kind: "error",
        mode: "live",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, [service]);

  const fetchHistory = useCallback(
    async (period: HistoryPeriod): Promise<void> => {
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      setState({ kind: "loading", mode: period });

      try {
        const historyService = HISTORY_SERVICE_MAP[service];
        const [processRows, roomRows, userRows] = await Promise.all([
          fetchHistoryRows(historyService, "process", period),
          fetchHistoryRows(historyService, "rooms", period),
          fetchHistoryRows(historyService, "users", period),
        ]);
        if (requestSeq.current !== seq) return;
        setState({
          kind: "history-ready",
          mode: period,
          service: historyService,
          rows: {
            process: processRows,
            rooms: roomRows,
            users: userRows,
          },
        });
      } catch (err) {
        if (requestSeq.current !== seq) return;
        setState({
          kind: "error",
          mode: period,
          message: err instanceof Error ? err.message : "unknown error",
        });
      }
    },
    [service],
  );

  useEffect(() => {
    if (mode !== "live") return;
    void fetchAll();
    if (refresh === "off") return;
    const intervalMs = REFRESH_INTERVAL_MAP[refresh];
    const t = setInterval(() => {
      void fetchAll();
    }, intervalMs);
    return () => clearInterval(t);
  }, [fetchAll, mode, refresh]);

  useEffect(() => {
    if (mode === "live") return;
    void fetchHistory(mode);
  }, [fetchHistory, mode]);

  const liveState = state.kind === "live-ready" && mode === "live" ? state : null;
  const historyState = state.kind === "history-ready" && state.mode === mode ? state : null;

  const memoryChartData = useMemo(() => {
    if (!liveState?.server) return [];
    return liveState.server.samples.map((s) => ({
      ts: s.ts,
      rss: Math.round(s.memory.rss / 1024 / 1024),
      heapUsed: Math.round(s.memory.heapUsed / 1024 / 1024),
    }));
  }, [liveState]);

  const cpuChartData = useMemo(() => {
    if (!liveState?.server) return [];
    return liveState.server.samples.map((s) => ({
      ts: s.ts,
      cpu: s.cpuPct,
    }));
  }, [liveState]);

  const lagChartData = useMemo(() => {
    if (!liveState?.server) return [];
    return liveState.server.samples.map((s) => ({
      ts: s.ts,
      p50: s.eventLoopLagMs.p50,
      p99: s.eventLoopLagMs.p99,
    }));
  }, [liveState]);

  const historyMemoryChartData = useMemo(() => {
    if (!historyState) return [];
    return historyState.rows.process.flatMap((row) => {
      const captured_at = extractCapturedAt(row);
      const sample = extractResourceSample(row.data);
      if (captured_at === null || !sample) return [];
      return [{
        captured_at,
        rss: Math.round(sample.memory.rss / 1024 / 1024),
        heapUsed: Math.round(sample.memory.heapUsed / 1024 / 1024),
      }];
    });
  }, [historyState]);

  const historyCpuChartData = useMemo(() => {
    if (!historyState) return [];
    return historyState.rows.process.flatMap((row) => {
      const captured_at = extractCapturedAt(row);
      const sample = extractResourceSample(row.data);
      if (captured_at === null || !sample) return [];
      return [{ captured_at, cpuPct: sample.cpuPct }];
    });
  }, [historyState]);

  const historyLagChartData = useMemo(() => {
    if (!historyState) return [];
    return historyState.rows.process.flatMap((row) => {
      const captured_at = extractCapturedAt(row);
      const sample = extractResourceSample(row.data);
      if (captured_at === null || !sample) return [];
      return [{ captured_at, p99: sample.eventLoopLagMs.p99 }];
    });
  }, [historyState]);

  const historyRoomsChartData = useMemo(() => {
    if (!historyState) return [];
    return historyState.rows.rooms.flatMap((row) => {
      const captured_at = extractCapturedAt(row);
      const totals = extractRoomTotals(row.data);
      if (captured_at === null || !totals) return [];
      return [{ captured_at, ...totals }];
    });
  }, [historyState]);

  const server = liveState?.server ?? null;
  const rooms = liveState?.rooms ?? null;
  const host = liveState?.host ?? null;
  const current = server?.current;
  const isLoading = state.kind === "loading" && state.mode === mode;
  const errorMessage = state.kind === "error" && state.mode === mode ? state.message : null;
  const historyHasData =
    historyMemoryChartData.length > 0 ||
    historyCpuChartData.length > 0 ||
    historyLagChartData.length > 0 ||
    historyRoomsChartData.length > 0;

  const handleRefresh = (): void => {
    if (mode === "live") {
      void fetchAll();
    } else {
      void fetchHistory(mode);
    }
  };

  return (
    <div className="space-y-4">
      <TabDescription>
        rezona-server プロセスの健全性を可視化します。
        <br />
        ライブモードでは Droplet host、現在値カード、直近 60 秒の sample
        グラフ、Rooms テーブルを表示します。
        <br />
        期間モードでは service_metrics に保存された履歴から process / rooms /
        users を取得し、メモリ、CPU、event loop lag、接続数の推移を表示します。
      </TabDescription>

      {/* 制御バー */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>更新間隔:</span>
        <div
          className={`flex rounded border border-slate-700 bg-slate-800 p-0.5 ${
            mode !== "live" ? "opacity-50" : ""
          }`}
        >
          {(["5s", "60s", "1h", "24h", "off"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setRefresh(opt)}
              disabled={mode !== "live"}
              className={`rounded px-2 py-1 transition disabled:cursor-not-allowed ${
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
                        : "24 時間置き。事実上手動相当（server 側のメモリ保持窓は 60 秒固定）"
              }
            >
              {opt}
            </button>
          ))}
        </div>
        <span>モード:</span>
        <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setMode(opt)}
              className={`rounded px-2 py-1 transition ${
                mode === opt
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt === "live" ? "ライブ" : opt}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "読み込み中..." : "再取得"}
        </button>
        {server && (
          <span className="ml-auto">
            uptime: <span className="text-slate-200">{formatUptime(server.uptime_sec)}</span>
          </span>
        )}
      </div>

      {errorMessage && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-red-300">
          エラー: {errorMessage}
        </p>
      )}

      {mode !== "live" && isLoading && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
          履歴データを読み込み中...
        </p>
      )}

      {mode !== "live" && historyState && (
        <section className="space-y-4">
          {!historyHasData && (
            <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
              この期間の履歴データはありません。
            </p>
          )}
          {historyHasData && (
            <>
              <ChartCard
                title="Memory (MB)"
                data={historyMemoryChartData}
                keys={["rss", "heapUsed"]}
                colors={["#60a5fa", "#34d399"]}
                unit="MB"
                xKey="captured_at"
                period={historyState.mode}
                decimals={1}
              />
              <ChartCard
                title="CPU (%)"
                data={historyCpuChartData}
                keys={["cpuPct"]}
                colors={["#fbbf24"]}
                unit="%"
                xKey="captured_at"
                period={historyState.mode}
                decimals={1}
              />
              <ChartCard
                title="Event loop lag p99 (ms)"
                data={historyLagChartData}
                keys={["p99"]}
                colors={["#f87171"]}
                unit="ms"
                xKey="captured_at"
                period={historyState.mode}
                decimals={1}
              />
              <ChartCard
                title="Online users / publishers"
                data={historyRoomsChartData}
                keys={["socket_total_connections", "livekit_publishers"]}
                colors={["#38bdf8", "#a78bfa"]}
                unit=""
                xKey="captured_at"
                period={historyState.mode}
                decimals={0}
              />
            </>
          )}
        </section>
      )}

      {/* Host (Droplet) 全体 */}
      {host && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-2">
            <h3 className="text-sm font-medium text-slate-200">
              Droplet host (全コンテナ合算)
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              rezona-server / portal / livekit / caddy / app / etc. 全部の合算。
              rezona-server プロセス単独の値は下のセクションで確認。
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

      {/* rezona-server プロセス単独 */}
      {mode === "live" && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-2">
            <h3 className="text-sm font-medium text-slate-200">
              rezona-server プロセス単独
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              host 全体ではなく、Node.js プロセスの内訳。直近 60 秒の時系列付き。
            </p>
          </header>
          <div className="space-y-4 px-4 py-3">
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
  xKey = "ts",
  period,
  decimals = 1,
}: {
  title: string;
  data: Array<Record<string, number>>;
  keys: string[];
  colors: string[];
  unit: string;
  xKey?: string;
  period?: HistoryPeriod;
  decimals?: number;
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
              dataKey={xKey}
              tickFormatter={(t: number) => formatTimeLabel(t, period)}
              tick={{ fill: "#64748b", fontSize: 9 }}
              stroke="#334155"
              minTickGap={30}
            />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} stroke="#334155" />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
              labelFormatter={(t) => formatTimeLabel(Number(t), period)}
              formatter={(value) => `${Number(value).toFixed(decimals)}${unit}`}
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
