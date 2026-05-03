"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TabDescription } from "./TabDescription";
import { TimeRangeSelector, type TimeRange } from "./TimeRangeSelector";

type SyncEventName =
  | "livekit.metrics.unreachable"
  | "socket.assertion.fail"
  | "socket.reconnect.in_grace"
  | "auth.socket.fail"
  | "livekit.webhook.in";

type TimelineEvent = {
  id: string;
  source: "otel" | "service_logs";
  event: SyncEventName;
  occurred_at: string;
  service: string;
  level: string | null;
  message: string | null;
  trace_id: string | null;
  span_id: string | null;
  context: unknown;
};

type LivekitStatus = "ok" | "warning" | "critical";

type LivekitSummary = {
  total24h: number;
  last1h: number;
  list_rooms_failed: number;
  user_metrics_list_rooms_failed: number;
  reasonCounts: Record<string, number>;
  status: LivekitStatus;
};

type SyncResponse = {
  timelineEvents: TimelineEvent[];
  assertionFailures: TimelineEvent[];
  livekit: LivekitSummary;
};

type ChartBin = {
  bucket: number;
  label: string;
  [key: string]: number | string;
};

const BIN_MS = 5 * 60_000;

const EVENT_CONFIG: Array<{
  event: SyncEventName;
  key: string;
  label: string;
  color: string;
}> = [
  {
    event: "livekit.metrics.unreachable",
    key: "livekit_metrics_unreachable",
    label: "LiveKit unreachable",
    color: "#f87171",
  },
  {
    event: "socket.assertion.fail",
    key: "socket_assertion_fail",
    label: "Assertion fail",
    color: "#fb923c",
  },
  {
    event: "socket.reconnect.in_grace",
    key: "socket_reconnect_in_grace",
    label: "Reconnect grace",
    color: "#facc15",
  },
  {
    event: "auth.socket.fail",
    key: "auth_socket_fail",
    label: "Auth socket fail",
    color: "#60a5fa",
  },
  {
    event: "livekit.webhook.in",
    key: "livekit_webhook_in",
    label: "LiveKit webhook",
    color: "#34d399",
  },
];

const PERIOD_MS: Record<Exclude<TimeRange, "all">, number> = {
  "1h": 3600_000,
  "7h": 7 * 3600_000,
  "24h": 24 * 3600_000,
};

function formatTimeLabel(ms: number, range?: TimeRange): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  if (range === "all") {
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mi}`;
  }
  return `${hh}:${mi}`;
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}:${ss}`;
}

function eventClass(event: SyncEventName): string {
  if (event === "livekit.metrics.unreachable") return "border-red-500/30 bg-red-500/20 text-red-300";
  if (event === "socket.assertion.fail") return "border-orange-500/30 bg-orange-500/20 text-orange-300";
  if (event === "socket.reconnect.in_grace") return "border-yellow-500/30 bg-yellow-500/20 text-yellow-200";
  if (event === "auth.socket.fail") return "border-sky-500/30 bg-sky-500/20 text-sky-300";
  return "border-emerald-500/30 bg-emerald-500/20 text-emerald-300";
}

function statusView(status: LivekitStatus): {
  title: string;
  className: string;
  description: string;
} {
  if (status === "ok") {
    return {
      title: "接続正常",
      className: "border-emerald-500/30 bg-emerald-950/30 text-emerald-200",
      description: "直近 1h の livekit.metrics.unreachable は 0 件です。",
    };
  }
  if (status === "warning") {
    return {
      title: "散発失敗",
      className: "border-yellow-500/30 bg-yellow-950/30 text-yellow-200",
      description: "直近 1h に 1-9 件の LiveKit 接続失敗があります。",
    };
  }
  return {
    title: "LiveKit 不通の疑い",
    className: "border-red-500/30 bg-red-950/30 text-red-200",
    description: "直近 1h に 10 件以上の LiveKit 接続失敗があります。",
  };
}

function emptyBin(bucket: number, range: TimeRange): ChartBin {
  const row: ChartBin = {
    bucket,
    label: formatTimeLabel(bucket, range),
  };
  for (const config of EVENT_CONFIG) row[config.key] = 0;
  return row;
}

function buildChartData(events: TimelineEvent[], range: TimeRange): ChartBin[] {
  if (events.length === 0) return [];

  const now = Date.now();
  const eventTimes = events
    .map((event) => Date.parse(event.occurred_at))
    .filter((value) => Number.isFinite(value));
  if (eventTimes.length === 0) return [];

  const start =
    range === "all"
      ? Math.min(...eventTimes)
      : now - PERIOD_MS[range];
  const startBucket = Math.floor(start / BIN_MS) * BIN_MS;
  const endBucket = Math.floor(now / BIN_MS) * BIN_MS;
  const bins = new Map<number, ChartBin>();

  for (let bucket = startBucket; bucket <= endBucket; bucket += BIN_MS) {
    bins.set(bucket, emptyBin(bucket, range));
  }

  for (const event of events) {
    const ts = Date.parse(event.occurred_at);
    if (!Number.isFinite(ts) || ts < startBucket || ts > endBucket + BIN_MS) continue;
    const bucket = Math.floor(ts / BIN_MS) * BIN_MS;
    const row = bins.get(bucket) ?? emptyBin(bucket, range);
    const config = EVENT_CONFIG.find((item) => item.event === event.event);
    if (config) {
      row[config.key] = Number(row[config.key] ?? 0) + 1;
    }
    bins.set(bucket, row);
  }

  return Array.from(bins.values()).sort((a, b) => a.bucket - b.bucket);
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function AssertionDetail({ event }: { event: TimelineEvent | null }) {
  if (!event) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
        assertion fail を選択してください
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded border px-1.5 py-0.5 ${eventClass(event.event)}`}>
            {event.event}
          </span>
          <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">
            {event.source}
          </span>
          <span className="text-slate-500">{formatAbsolute(event.occurred_at)}</span>
        </div>
        <h3 className="mt-2 font-mono text-sm text-slate-100">{event.service}</h3>
      </header>
      <div className="space-y-3 px-4 py-3 text-xs">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">level</dt>
            <dd className="font-mono text-slate-200">{event.level ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">trace_id</dt>
            <dd className="break-all font-mono text-slate-200">{event.trace_id ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">span_id</dt>
            <dd className="break-all font-mono text-slate-200">{event.span_id ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">occurred_at</dt>
            <dd className="font-mono text-slate-200">{event.occurred_at}</dd>
          </div>
        </dl>
        <div>
          <h4 className="mb-1 text-xs font-medium text-slate-300">message/body</h4>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
            {event.message ?? "(null)"}
          </pre>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-medium text-slate-300">context</h4>
          <JsonBlock value={event.context} />
        </div>
      </div>
    </section>
  );
}

function LivekitPanel({ livekit }: { livekit: LivekitSummary | null }) {
  if (!livekit) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
        LiveKit 状況を読み込み中...
      </section>
    );
  }

  const view = statusView(livekit.status);
  const reasons = Object.entries(livekit.reasonCounts).sort((a, b) => b[1] - a[1]);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 px-4 py-3">
        <h2 className="font-medium">LiveKit 接続状況</h2>
      </header>
      <div className="space-y-4 px-4 py-3">
        <div className={`rounded border px-4 py-3 ${view.className}`}>
          <div className="text-sm font-medium">{view.title}</div>
          <p className="mt-1 text-xs opacity-80">{view.description}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="total (24h)" value={livekit.total24h} />
          <MetricCard label="last 1h" value={livekit.last1h} />
          <MetricCard label="list_rooms_failed" value={livekit.list_rooms_failed} />
          <MetricCard
            label="user_metrics_list_rooms_failed"
            value={livekit.user_metrics_list_rooms_failed}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-800 text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left font-medium">reason</th>
                <th className="px-2 py-2 text-right font-medium">count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reasons.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-2 py-4 text-slate-500">
                    24h 内の livekit.metrics.unreachable はありません。
                  </td>
                </tr>
              )}
              {reasons.map(([reason, count]) => (
                <tr key={reason}>
                  <td className="px-2 py-2 font-mono text-slate-300">{reason}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                    {count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{value}</div>
    </div>
  );
}

export function SyncCheckClient() {
  const [period, setPeriod] = useState<TimeRange>("24h");
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [assertionFailures, setAssertionFailures] = useState<TimelineEvent[]>([]);
  const [livekit, setLivekit] = useState<LivekitSummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period, limit: "10000" });
      const res = await fetch(`/api/admin/otel/sync-check?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as Partial<SyncResponse> & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setTimelineEvents(Array.isArray(json.timelineEvents) ? json.timelineEvents : []);
      setAssertionFailures(
        Array.isArray(json.assertionFailures) ? json.assertionFailures : [],
      );
      setLivekit(json.livekit ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (assertionFailures.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !assertionFailures.some((event) => event.id === selectedId)) {
      setSelectedId(assertionFailures[0].id);
    }
  }, [assertionFailures, selectedId]);

  const chartData = useMemo(
    () => buildChartData(timelineEvents, period),
    [period, timelineEvents],
  );
  const selectedAssertion = useMemo(
    () => assertionFailures.find((event) => event.id === selectedId) ?? null,
    [assertionFailures, selectedId],
  );

  return (
    <div className="space-y-4">
      <TabDescription>
        OTel logs と旧 service_logs の同期関連イベントを横断して、socket / LiveKit の
        同期切れ症状だけを確認するビューです。
      </TabDescription>

      <div className="flex flex-wrap items-center gap-2">
        <TimeRangeSelector value={period} onChange={setPeriod} />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "読み込み中..." : "再取得"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-red-300">
          エラー: {error}
        </p>
      )}

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">同期関連イベント時系列</h2>
          <span className="text-xs text-slate-500">{timelineEvents.length} events</span>
        </header>
        <div className="px-2 py-3" style={{ height: 280 }}>
          {loading && chartData.length === 0 ? (
            <p className="px-2 py-6 text-sm text-slate-400">読み込み中...</p>
          ) : chartData.length === 0 ? (
            <p className="px-2 py-6 text-sm text-slate-400">
              この期間の同期関連イベントはありません。
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value: number) => formatTimeLabel(value, period)}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  stroke="#334155"
                  minTickGap={28}
                />
                <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 10 }} stroke="#334155" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    fontSize: 11,
                  }}
                  labelFormatter={(value) => formatTimeLabel(Number(value), period)}
                />
                {EVENT_CONFIG.map((config) => (
                  <Bar
                    key={config.event}
                    dataKey={config.key}
                    name={config.label}
                    stackId="sync"
                    fill={config.color}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-800 px-4 py-3 text-xs">
          {EVENT_CONFIG.map((config) => (
            <span key={config.event} className="flex items-center gap-1 text-slate-400">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: config.color }}
              />
              {config.event}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
            <h2 className="font-medium">同期不整合の検知</h2>
            <span className="text-xs text-slate-500">
              latest {assertionFailures.length} assertion fails
            </span>
          </header>
          <div className="max-h-[520px] divide-y divide-slate-800 overflow-y-auto">
            {loading && assertionFailures.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">読み込み中...</p>
            )}
            {!loading && assertionFailures.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">
                socket.assertion.fail はありません。
              </p>
            )}
            {assertionFailures.map((event) => {
              const selected = event.id === selectedId;
              return (
                <button
                  key={`${event.source}-${event.id}`}
                  type="button"
                  onClick={() => setSelectedId(event.id)}
                  className={`block w-full px-4 py-3 text-left text-xs ${
                    selected ? "bg-slate-800/70" : "hover:bg-slate-900/70"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 ${eventClass(event.event)}`}>
                      {event.event}
                    </span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">
                      {event.source}
                    </span>
                    <span className="font-mono text-slate-300">{event.service}</span>
                    <span className="ml-auto font-mono text-slate-500">
                      {formatAbsolute(event.occurred_at)}
                    </span>
                  </div>
                  {event.message && (
                    <div className="mt-1 truncate text-sm text-slate-200">{event.message}</div>
                  )}
                  {event.trace_id && (
                    <div className="mt-1 font-mono text-[11px] text-slate-500">
                      trace_id: {event.trace_id}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <AssertionDetail event={selectedAssertion} />
      </section>

      <LivekitPanel livekit={livekit} />
    </div>
  );
}
