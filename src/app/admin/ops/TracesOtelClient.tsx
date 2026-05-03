"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TabDescription } from "./TabDescription";
import { TimeRangeSelector, type TimeRange } from "./TimeRangeSelector";

type JsonObject = Record<string, unknown>;

type OtelSpanRow = {
  id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  service_name: string;
  span_name: string;
  span_kind: string | null;
  start_time: string;
  end_time: string;
  duration_ms: number | string | null;
  status_code: string | null;
  status_message: string | null;
  resource_attributes: JsonObject;
  span_attributes: JsonObject;
  events: unknown[];
  links: unknown[];
};

type TraceSummary = {
  traceId: string;
  spans: OtelSpanRow[];
  firstSpanName: string;
  spanCount: number;
  startMs: number;
  endMs: number;
  totalDurationMs: number;
};

type SpanNode = OtelSpanRow & { children: SpanNode[] };

type FetchResponse = {
  spans: OtelSpanRow[];
  services: string[];
};

function parseTime(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
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

function formatDuration(ms: number | string | null): string {
  const value = typeof ms === "string" ? Number(ms) : ms;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "-";
  if (value < 1) return `${value.toFixed(2)}ms`;
  if (value < 1000) return `${value.toFixed(1)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function durationMs(span: OtelSpanRow): number {
  const stored = typeof span.duration_ms === "string" ? Number(span.duration_ms) : span.duration_ms;
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  return Math.max(0, parseTime(span.end_time) - parseTime(span.start_time));
}

function shortId(value: string, head = 10, tail = 5): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function statusClass(status: string | null): string {
  if (status === "error") return "text-red-300";
  if (status === "ok") return "text-emerald-300";
  return "text-slate-400";
}

function kindBadgeClass(kind: string | null): string {
  if (kind === "server") return "border-sky-500/30 bg-sky-500/20 text-sky-300";
  if (kind === "client") return "border-emerald-500/30 bg-emerald-500/20 text-emerald-300";
  if (kind === "producer" || kind === "consumer") {
    return "border-violet-500/30 bg-violet-500/20 text-violet-300";
  }
  return "border-slate-700 bg-slate-900 text-slate-400";
}

function buildTraceSummaries(spans: OtelSpanRow[]): TraceSummary[] {
  const grouped = new Map<string, OtelSpanRow[]>();
  for (const span of spans) {
    const group = grouped.get(span.trace_id);
    if (group) group.push(span);
    else grouped.set(span.trace_id, [span]);
  }

  return Array.from(grouped.entries())
    .map(([traceId, traceSpans]) => {
      const sorted = [...traceSpans].sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));
      const startMs = Math.min(...sorted.map((span) => parseTime(span.start_time)));
      const endMs = Math.max(...sorted.map((span) => parseTime(span.end_time)));
      return {
        traceId,
        spans: sorted,
        firstSpanName: sorted[0]?.span_name ?? "(unknown)",
        spanCount: sorted.length,
        startMs,
        endMs,
        totalDurationMs: Math.max(0, endMs - startMs),
      };
    })
    .sort((a, b) => b.startMs - a.startMs);
}

function buildSpanTree(spans: OtelSpanRow[]): SpanNode[] {
  const nodes = new Map<string, SpanNode>();
  for (const span of spans) {
    nodes.set(span.span_id, { ...span, children: [] });
  }

  const roots: SpanNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_span_id ? nodes.get(node.parent_span_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (items: SpanNode[]) => {
    items.sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));
    for (const item of items) sortNodes(item.children);
  };
  sortNodes(roots);
  return roots;
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const empty =
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);

  return (
    <div>
      <h5 className="mb-1 text-[11px] font-medium text-slate-400">{title}</h5>
      {empty ? (
        <p className="rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-500">
          empty
        </p>
      ) : (
        <pre className="max-h-48 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SpanNodePanel({ node, depth }: { node: SpanNode; depth: number }) {
  return (
    <div className="space-y-2">
      <article
        className="rounded border border-slate-800 bg-slate-950/40 p-3"
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded border px-1.5 py-0.5 ${kindBadgeClass(node.span_kind)}`}>
            {node.span_kind ?? "internal"}
          </span>
          <span className={`font-mono ${statusClass(node.status_code)}`}>
            {node.status_code ?? "unset"}
          </span>
          <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">
            {node.service_name}
          </span>
          <span className="ml-auto tabular-nums text-slate-400">
            {formatDuration(durationMs(node))}
          </span>
        </div>
        <h4 className="mt-2 font-mono text-sm text-slate-100">{node.span_name}</h4>
        <div className="mt-1 grid gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
          <div>
            span_id: <span className="font-mono text-slate-300">{node.span_id}</span>
          </div>
          <div>
            parent: <span className="font-mono text-slate-300">{node.parent_span_id ?? "-"}</span>
          </div>
          <div>
            start: <span className="font-mono text-slate-300">{formatAbsolute(node.start_time)}</span>
          </div>
          <div>
            end: <span className="font-mono text-slate-300">{formatAbsolute(node.end_time)}</span>
          </div>
        </div>
        {node.status_message && (
          <p className="mt-2 rounded border border-red-900/50 bg-red-950/30 p-2 text-xs text-red-200">
            {node.status_message}
          </p>
        )}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <JsonBlock title="span_attributes" value={node.span_attributes} />
          <JsonBlock title="events" value={node.events} />
        </div>
      </article>
      {node.children.map((child) => (
        <SpanNodePanel key={child.span_id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function TraceDetail({ trace }: { trace: TraceSummary | null }) {
  const tree = useMemo(() => (trace ? buildSpanTree(trace.spans) : []), [trace]);

  if (!trace) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
        trace を選択してください
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 px-4 py-3">
        <h3 className="font-mono text-sm font-medium text-slate-100">{trace.traceId}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>{trace.spanCount} spans</span>
          <span>{formatDuration(trace.totalDurationMs)}</span>
          <span>{formatAbsolute(new Date(trace.startMs).toISOString())}</span>
        </div>
      </header>
      <div className="max-h-[720px] space-y-2 overflow-auto p-3">
        {tree.map((node) => (
          <SpanNodePanel key={node.span_id} node={node} depth={0} />
        ))}
      </div>
    </section>
  );
}

export function TracesOtelClient() {
  const [period, setPeriod] = useState<TimeRange>("24h");
  const [serviceName, setServiceName] = useState("");
  const [spans, setSpans] = useState<OtelSpanRow[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period, limit: "3000" });
      if (serviceName) params.set("service_name", serviceName);
      const res = await fetch(`/api/admin/otel/traces?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as Partial<FetchResponse> & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSpans(Array.isArray(json.spans) ? json.spans : []);
      setServices(Array.isArray(json.services) ? json.services : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, [period, serviceName]);

  useEffect(() => {
    void load();
  }, [load]);

  const traces = useMemo(() => buildTraceSummaries(spans), [spans]);

  useEffect(() => {
    if (traces.length === 0) {
      setSelectedTraceId(null);
      return;
    }
    if (!selectedTraceId || !traces.some((trace) => trace.traceId === selectedTraceId)) {
      setSelectedTraceId(traces[0].traceId);
    }
  }, [selectedTraceId, traces]);

  const selectedTrace = useMemo(
    () => traces.find((trace) => trace.traceId === selectedTraceId) ?? null,
    [selectedTraceId, traces],
  );

  return (
    <div className="space-y-4">
      <TabDescription>
        portal が受信した OTel spans を
        <code className="mx-1 rounded bg-slate-800 px-1">otel_traces</code>
        から trace_id 単位にまとめます。行を選択すると parent_span_id で復元した
        span chain と各 span の attributes / events を確認できます。
      </TabDescription>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">Traces (OTel)</h2>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-400">service</label>
            <select
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            >
              <option value="">all</option>
              {services.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </div>
          <TimeRangeSelector value={period} onChange={setPeriod} />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="ml-auto rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "読み込み中..." : "再取得"}
          </button>
        </header>

        {error && <p className="border-b border-slate-800 px-4 py-2 text-xs text-red-300">エラー: {error}</p>}

        <div className="grid gap-0 xl:grid-cols-[minmax(0,2fr)_minmax(480px,3fr)]">
          <div className="max-h-[720px] overflow-y-auto">
            {loading && traces.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">読み込み中...</p>
            )}
            {!loading && !error && traces.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">
                該当する OTel trace はありません。
              </p>
            )}
            {traces.length > 0 && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-slate-800 bg-slate-900 text-xs text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">trace_id</th>
                    <th className="px-2 py-2 text-left font-medium">first span</th>
                    <th className="px-2 py-2 text-right font-medium">spans</th>
                    <th className="px-2 py-2 text-right font-medium">duration</th>
                    <th className="px-4 py-2 text-right font-medium">start</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {traces.map((trace) => {
                    const isSelected = trace.traceId === selectedTraceId;
                    return (
                      <tr
                        key={trace.traceId}
                        onClick={() => setSelectedTraceId(trace.traceId)}
                        className={`cursor-pointer ${
                          isSelected ? "bg-slate-800/70" : "hover:bg-slate-900/70"
                        }`}
                      >
                        <td className="px-4 py-2 font-mono text-xs text-slate-200">
                          {shortId(trace.traceId)}
                        </td>
                        <td className="max-w-[280px] px-2 py-2">
                          <span className="block truncate font-mono text-xs text-slate-300">
                            {trace.firstSpanName}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                          {trace.spanCount}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-300">
                          {formatDuration(trace.totalDurationMs)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">
                          {formatAbsolute(new Date(trace.startMs).toISOString())}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-slate-800 p-3 xl:border-l xl:border-t-0">
            <TraceDetail trace={selectedTrace} />
          </div>
        </div>
      </section>
    </div>
  );
}
