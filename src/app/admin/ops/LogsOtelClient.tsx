"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TabDescription } from "./TabDescription";
import { TimeRangeSelector, type TimeRange } from "./TimeRangeSelector";

type JsonObject = Record<string, unknown>;

type OtelLogRow = {
  id: string;
  observed_timestamp: string;
  timestamp: string | null;
  trace_id: string | null;
  span_id: string | null;
  severity_text: string | null;
  severity_number: number | null;
  service_name: string;
  body: string | null;
  resource_attributes: JsonObject;
  log_attributes: JsonObject;
};

type FetchResponse = {
  logs: OtelLogRow[];
  services: string[];
  severities: string[];
};

function formatAbsolute(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}:${ss}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return iso;
  if (diff < 1_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function severityBadgeClass(severity: string | null): string {
  const v = (severity ?? "").toLowerCase();
  if (v.includes("fatal") || v.includes("error")) {
    return "border-red-500/30 bg-red-500/20 text-red-300";
  }
  if (v.includes("warn")) return "border-amber-500/30 bg-amber-500/20 text-amber-300";
  if (v.includes("info")) return "border-sky-500/30 bg-sky-500/20 text-sky-300";
  if (v.includes("debug") || v.includes("trace")) {
    return "border-slate-500/30 bg-slate-600/20 text-slate-300";
  }
  return "border-slate-700 bg-slate-900 text-slate-400";
}

function shortId(value: string | null, head = 10, tail = 4): string {
  if (!value) return "-";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function extractEventName(attrs: JsonObject): string | null {
  for (const key of ["event", "event.name", "name"]) {
    const value = attrs[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function jsonIsEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium text-slate-300">{title}</h4>
      {jsonIsEmpty(value) ? (
        <p className="rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-500">
          empty
        </p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function DetailPanel({ log }: { log: OtelLogRow | null }) {
  if (!log) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
        ログ行を選択してください
      </section>
    );
  }

  const eventName = extractEventName(log.log_attributes);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded border px-1.5 py-0.5 ${severityBadgeClass(log.severity_text)}`}>
            {log.severity_text ?? "unknown"}
          </span>
          <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">
            {log.service_name}
          </span>
        </div>
        <h3 className="mt-2 text-sm font-medium text-slate-100">
          {eventName ?? log.body ?? "(empty body)"}
        </h3>
      </header>

      <div className="space-y-4 px-4 py-3 text-xs">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">timestamp</dt>
            <dd className="font-mono text-slate-200">{log.timestamp ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">observed_timestamp</dt>
            <dd className="font-mono text-slate-200">{log.observed_timestamp}</dd>
          </div>
          <div>
            <dt className="text-slate-500">trace_id</dt>
            <dd className="break-all font-mono text-slate-200">{log.trace_id ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">span_id</dt>
            <dd className="break-all font-mono text-slate-200">{log.span_id ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">severity</dt>
            <dd className="font-mono text-slate-200">
              {log.severity_text ?? "-"} / {log.severity_number ?? "-"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">service_name</dt>
            <dd className="font-mono text-slate-200">{log.service_name}</dd>
          </div>
        </dl>

        <div>
          <h4 className="mb-1 text-xs font-medium text-slate-300">body</h4>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
            {log.body ?? "(null)"}
          </pre>
        </div>

        <JsonBlock title="resource_attributes" value={log.resource_attributes} />
        <JsonBlock title="log_attributes" value={log.log_attributes} />
      </div>
    </section>
  );
}

export function LogsOtelClient() {
  const [period, setPeriod] = useState<TimeRange>("24h");
  const [serviceName, setServiceName] = useState("");
  const [severityText, setSeverityText] = useState("all");
  const [logs, setLogs] = useState<OtelLogRow[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [severities, setSeverities] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period, limit: "250" });
      if (serviceName) params.set("service_name", serviceName);
      if (severityText !== "all") params.set("severity_text", severityText);
      const res = await fetch(`/api/admin/otel/logs?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as Partial<FetchResponse> & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setLogs(Array.isArray(json.logs) ? json.logs : []);
      setServices(Array.isArray(json.services) ? json.services : []);
      setSeverities(Array.isArray(json.severities) ? json.severities : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, [period, serviceName, severityText]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (logs.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !logs.some((log) => log.id === selectedId)) {
      setSelectedId(logs[0].id);
    }
  }, [logs, selectedId]);

  const selected = useMemo(
    () => logs.find((log) => log.id === selectedId) ?? null,
    [logs, selectedId],
  );

  return (
    <div className="space-y-4">
      <TabDescription>
        portal が受信した OTel logs を Supabase の
        <code className="mx-1 rounded bg-slate-800 px-1">otel_logs</code>
        から表示します。OTel の trace_id / span_id / resource attributes / log attributes
        を直接確認します。
      </TabDescription>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">Logs (OTel)</h2>
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
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-400">severity</label>
            <select
              value={severityText}
              onChange={(e) => setSeverityText(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            >
              <option value="all">all</option>
              {severities.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
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

        <div className="grid gap-0 lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
          <div className="max-h-[720px] divide-y divide-slate-800 overflow-y-auto">
            {loading && logs.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">読み込み中...</p>
            )}
            {!loading && !error && logs.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">
                該当する OTel log はありません。
              </p>
            )}
            {logs.map((log) => {
              const isSelected = log.id === selectedId;
              const eventName = extractEventName(log.log_attributes);
              const primary = eventName ?? log.body ?? "(empty body)";
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedId(log.id)}
                  className={`block w-full px-4 py-3 text-left text-sm ${
                    isSelected ? "bg-slate-800/70" : "hover:bg-slate-900/70"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded border px-1.5 py-0.5 ${severityBadgeClass(log.severity_text)}`}>
                      {log.severity_text ?? "unknown"}
                    </span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">
                      {log.service_name}
                    </span>
                    {log.trace_id && (
                      <span className="font-mono text-slate-500">
                        trace {shortId(log.trace_id)}
                      </span>
                    )}
                    <span className="ml-auto text-slate-500">
                      {formatRelative(log.timestamp ?? log.observed_timestamp)}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-medium text-slate-100">{primary}</div>
                  <div className="mt-0.5 font-mono text-xs text-slate-500">
                    {formatAbsolute(log.timestamp ?? log.observed_timestamp)}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-800 p-3 lg:border-l lg:border-t-0">
            <DetailPanel log={selected} />
          </div>
        </div>
      </section>
    </div>
  );
}
