"use client";

import { useCallback, useEffect, useState } from "react";

import type { SentryServiceKey } from "./IssuesClient";
import { TabDescription } from "./TabDescription";
import {
  TimeRangeSelector,
  toSentryStatsPeriod,
  type TimeRange,
} from "./TimeRangeSelector";

type LogEventItem = {
  id: string;
  eventID: string;
  dateCreated: string;
  message: string | null;
  title: string;
  level?: string;
  location: string | null;
  culprit: string | null;
  platform: string;
  groupID: string | null;
  tags: Array<{ key: string; value: string }>;
  _projectTag: string;
  _service: SentryServiceKey;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      events: LogEventItem[];
      level: string;
      loadedAt: number;
      configured: boolean;
    }
  | { kind: "error"; message: string };

type LevelFilter = "all" | "warning" | "error";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function levelBadgeClass(level: string | undefined): string {
  const v = (level ?? "").toLowerCase();
  if (v === "fatal" || v === "error") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (v === "warning" || v === "warn") return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  if (v === "info") return "bg-sky-500/20 text-sky-300 border-sky-500/30";
  return "bg-slate-600/20 text-slate-300 border-slate-500/30";
}

function projectTagClass(tag: string): string {
  if (tag === "server")
    return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
  if (tag === "web")
    return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  return "bg-slate-600/20 text-slate-300 border-slate-500/30";
}

function findTag(event: LogEventItem, key: string): string | null {
  const hit = event.tags.find((t) => t.key === key);
  return hit?.value ?? null;
}

function buildClaudeContext(event: LogEventItem): string {
  const lines: string[] = [
    `# Sentry Log Event: ${event.title}`,
    `- Project: ${event._projectTag}`,
    `- Level: ${event.level ?? "(none)"}`,
    `- When: ${event.dateCreated}`,
    `- Event ID: ${event.eventID}`,
  ];
  if (event.message) lines.push(`- Message: ${event.message}`);
  if (event.culprit) lines.push(`- Culprit: ${event.culprit}`);
  const traceId = findTag(event, "trace_id") ?? findTag(event, "trace");
  if (traceId) lines.push(`- trace_id: ${traceId}`);
  const route = findTag(event, "url") ?? findTag(event, "route");
  if (route) lines.push(`- route: ${route}`);
  if (event.tags.length > 0) {
    lines.push("", "## Tags");
    for (const t of event.tags.slice(0, 20)) {
      lines.push(`- ${t.key}: ${t.value}`);
    }
  }
  lines.push("", "## 依頼内容");
  lines.push("このログの原因と対応方針を日本語で教えてください。");
  return lines.join("\n");
}

export function LogsClient({ service }: { service: SentryServiceKey }) {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [level, setLevel] = useState<LevelFilter>("all");
  const [period, setPeriod] = useState<TimeRange>("24h");
  const [refreshing, setRefreshing] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const fetchEvents = useCallback(
    async (filter: LevelFilter) => {
      setState({ kind: "loading" });
      try {
        const params = new URLSearchParams();
        if (filter !== "all") params.set("level", filter);
        params.set("service", service);
        params.set("statsPeriod", toSentryStatsPeriod(period));
        const res = await fetch(`/api/admin/sentry/events?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          events: LogEventItem[];
          level: string;
          configured?: boolean;
        };
        setState({
          kind: "ready",
          events: json.events,
          level: json.level,
          loadedAt: Date.now(),
          configured: json.configured !== false,
        });
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "unknown error",
        });
      }
    },
    [service, period],
  );

  useEffect(() => {
    fetchEvents(level);
  }, [fetchEvents, level]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 既存の全キャッシュ clear POST route を流用
      const res = await fetch("/api/admin/ops/refresh", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        setCopyHint(`キャッシュ再取得失敗 (HTTP ${res.status}) — キャッシュ済データを表示します`);
        setTimeout(() => setCopyHint(null), 4000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      setCopyHint(`キャッシュ再取得失敗 (${msg}) — キャッシュ済データを表示します`);
      setTimeout(() => setCopyHint(null), 4000);
    }
    try {
      await fetchEvents(level);
    } finally {
      setRefreshing(false);
    }
  }, [fetchEvents, level, refreshing]);

  const handleCopy = useCallback(async (event: LogEventItem) => {
    const text = buildClaudeContext(event);
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("クリップボードへコピー済 → Claude チャットに貼ってください");
    } catch {
      setCopyHint("コピー失敗。ブラウザ権限を確認してください");
    }
    setTimeout(() => setCopyHint(null), 4000);
  }, []);

  const events = state.kind === "ready" ? state.events : [];

  return (
    <div className="space-y-4">
      <TabDescription>
        サーバー側 `pino` ロガーが <strong className="text-slate-200">warn / error / fatal</strong> レベルで出力したログを
        Sentry 経由で時系列表示します。Phase 2 の Option B により、worker_thread を介さず
        main thread の Sentry を直接使うため `beforeSend` (PII scrub) が確実に適用されます。
        各エントリの「Claude に聞く内容をコピー」で AI トリアージできます。
      </TabDescription>
      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <h2 className="font-medium">Logs (pino warn/error → Sentry)</h2>
        <div className="flex items-center gap-2">
          <TimeRangeSelector value={period} onChange={setPeriod} />
          <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs">
            {(["all", "warning", "error"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setLevel(opt)}
                className={`rounded px-2 py-1 transition ${
                  level === opt ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || state.kind === "loading"}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-800"
            type="button"
          >
            {refreshing || state.kind === "loading" ? "読み込み中..." : "再取得"}
          </button>
        </div>
      </header>

      <div className="divide-y divide-slate-800">
        {state.kind === "loading" && (
          <p className="px-4 py-6 text-sm text-slate-400">読み込み中...</p>
        )}
        {state.kind === "error" && (
          <p className="px-4 py-6 text-sm text-red-300">エラー: {state.message}</p>
        )}
        {state.kind === "ready" && !state.configured && (
          <p className="px-4 py-6 text-sm text-amber-300">
            {service} の Sentry 連携は未設定です（env に SENTRY_REZONA_* 等を設定してください）
          </p>
        )}
        {state.kind === "ready" && state.configured && events.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-400">
            該当する warn / error レベルのログはありません
          </p>
        )}
        {events.map((event) => {
          const traceId =
            findTag(event, "trace_id") ?? findTag(event, "trace") ?? null;
          const transaction = findTag(event, "transaction") ?? null;
          return (
            <article key={event.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded border px-1.5 py-0.5 ${levelBadgeClass(event.level)}`}
                >
                  {event.level ?? "(none)"}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 ${projectTagClass(event._projectTag)}`}
                >
                  {event._projectTag}
                </span>
                {transaction && (
                  <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">
                    {transaction}
                  </span>
                )}
                <span className="ml-auto text-slate-500">
                  {formatRelative(event.dateCreated)}
                </span>
              </div>
              <div className="mt-1 font-medium text-slate-100">{event.title}</div>
              {event.message && event.message !== event.title && (
                <div className="mt-0.5 text-slate-400">{event.message}</div>
              )}
              {event.culprit && (
                <div className="mt-0.5 text-xs text-slate-500">{event.culprit}</div>
              )}
              {traceId && (
                <div className="mt-0.5 text-xs font-mono text-slate-500">
                  trace_id: {traceId}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(event)}
                  className="rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
                >
                  Claude に聞く内容をコピー
                </button>
                {event.groupID && (
                  <a
                    href={`https://sentry.io/organizations/shuu-dw/issues/${event.groupID}/events/${event.eventID}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-sky-300 hover:underline"
                  >
                    Sentry で開く ↗
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {copyHint && <p className="px-4 pb-3 text-xs text-emerald-300">{copyHint}</p>}
      </section>
    </div>
  );
}
