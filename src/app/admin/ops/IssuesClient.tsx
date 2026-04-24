"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type SentryServiceKey = "boundary" | "rezona";

type IssueListItem = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  status: string;
  permalink: string;
  firstSeen: string;
  lastSeen: string;
  count: string;
  project: { slug: string; name: string };
  metadata: { type?: string; value?: string } | null;
  _projectTag: string;
  _service: SentryServiceKey;
};

type IssueEntry = { type: string; data: unknown };

type IssueDetail = Omit<IssueListItem, "_projectTag" | "_service"> & {
  _projectTag?: string;
  _service?: SentryServiceKey;
  latestEvent: {
    eventID: string;
    dateCreated: string;
    title: string;
    message: string | null;
    platform: string;
    entries: IssueEntry[];
    tags: Array<{ key: string; value: string }>;
  } | null;
};

type FetchListState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; issues: IssueListItem[]; loadedAt: number; configured: boolean }
  | { kind: "error"; message: string };

type FetchDetailState =
  | { kind: "idle" }
  | { kind: "loading"; id: string }
  | { kind: "ready"; detail: IssueDetail }
  | { kind: "error"; message: string };

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function levelBadgeClass(level: string): string {
  switch (level) {
    case "fatal":
    case "error":
      return "bg-red-500/20 text-red-300 border-red-500/30";
    case "warning":
      return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "info":
      return "bg-sky-500/20 text-sky-300 border-sky-500/30";
    default:
      return "bg-slate-600/20 text-slate-300 border-slate-500/30";
  }
}

function projectTagClass(tag: string): string {
  if (tag === "server")
    return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
  if (tag === "web")
    return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  return "bg-slate-600/20 text-slate-300 border-slate-500/30";
}

function buildClaudeContext(detail: IssueDetail): string {
  const lines: string[] = [
    `# Sentry Issue: ${detail.title}`,
    `- Project: ${detail._projectTag ?? detail.project.slug} (${detail.project.slug})`,
    `- Level: ${detail.level}`,
    `- Count: ${detail.count}`,
    `- First seen: ${detail.firstSeen}`,
    `- Last seen: ${detail.lastSeen}`,
    `- Permalink: ${detail.permalink}`,
  ];
  if (detail.culprit) lines.push(`- Culprit: ${detail.culprit}`);
  if (detail.latestEvent) {
    lines.push("", "## Latest event");
    lines.push(`- Event ID: ${detail.latestEvent.eventID}`);
    lines.push(`- When: ${detail.latestEvent.dateCreated}`);
    if (detail.latestEvent.message) lines.push(`- Message: ${detail.latestEvent.message}`);
    const exceptionEntry = detail.latestEvent.entries.find((e) => e.type === "exception");
    if (exceptionEntry) {
      lines.push("", "## Exception entry");
      lines.push("```json");
      lines.push(JSON.stringify(exceptionEntry.data, null, 2).slice(0, 4000));
      lines.push("```");
    }
  }
  lines.push("", "## 依頼内容");
  lines.push("このエラーの原因と修正案を日本語で教えてください。");
  return lines.join("\n");
}

export function IssuesClient({ service }: { service: SentryServiceKey }) {
  const [listState, setListState] = useState<FetchListState>({ kind: "idle" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<FetchDetailState>({ kind: "idle" });
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchList = useCallback(async () => {
    setListState({ kind: "loading" });
    try {
      const res = await fetch(`/api/admin/sentry/issues?service=${service}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        issues: IssueListItem[];
        configured?: boolean;
      };
      setListState({
        kind: "ready",
        issues: json.issues,
        loadedAt: Date.now(),
        configured: json.configured !== false,
      });
    } catch (err) {
      setListState({ kind: "error", message: err instanceof Error ? err.message : "unknown error" });
    }
  }, [service]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
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
      await fetchList();
    } finally {
      setRefreshing(false);
    }
  }, [fetchList, refreshing]);

  const fetchDetail = useCallback(
    async (id: string) => {
      setDetailState({ kind: "loading", id });
      try {
        const res = await fetch(
          `/api/admin/sentry/issues/${encodeURIComponent(id)}?service=${service}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { issue: IssueDetail | null };
        if (!json.issue) {
          setDetailState({ kind: "error", message: "Issue 詳細が取得できません" });
          return;
        }
        setDetailState({ kind: "ready", detail: json.issue });
      } catch (err) {
        setDetailState({
          kind: "error",
          message: err instanceof Error ? err.message : "unknown error",
        });
      }
    },
    [service],
  );

  useEffect(() => {
    // service が変わったら選択も解除
    setSelectedId(null);
  }, [service]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!selectedId) {
      setDetailState({ kind: "idle" });
      return;
    }
    fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  const handleCopy = useCallback(async (detail: IssueDetail) => {
    const text = buildClaudeContext(detail);
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("クリップボードへコピー済 → Claude チャットに貼ってください");
    } catch {
      setCopyHint("コピー失敗。ブラウザ権限を確認してください");
    }
    setTimeout(() => setCopyHint(null), 4000);
  }, []);

  const issues = listState.kind === "ready" ? listState.issues : [];
  const selectedFromList = useMemo(
    () => issues.find((i) => i.id === selectedId) ?? null,
    [issues, selectedId],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">未解決 Issues (直近 24h)</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing || listState.kind === "loading"}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-800"
            type="button"
          >
            {refreshing || listState.kind === "loading" ? "読み込み中..." : "再取得"}
          </button>
        </header>
        <div className="divide-y divide-slate-800">
          {listState.kind === "loading" && <p className="px-4 py-6 text-sm text-slate-400">読み込み中...</p>}
          {listState.kind === "error" && (
            <p className="px-4 py-6 text-sm text-red-300">エラー: {listState.message}</p>
          )}
          {listState.kind === "ready" && !listState.configured && (
            <p className="px-4 py-6 text-sm text-amber-300">
              {service} の Sentry 連携は未設定です（env に SENTRY_REZONA_* 等を設定してください）
            </p>
          )}
          {listState.kind === "ready" && listState.configured && issues.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400">未解決 Issue はありません</p>
          )}
          {issues.map((issue) => {
            const isActive = issue.id === selectedId;
            return (
              <button
                key={issue.id}
                onClick={() => setSelectedId(issue.id)}
                className={`block w-full px-4 py-3 text-left transition ${
                  isActive ? "bg-slate-800/80" : "hover:bg-slate-800/40"
                }`}
                type="button"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`rounded border px-1.5 py-0.5 ${projectTagClass(issue._projectTag)}`}
                  >
                    {issue._projectTag}
                  </span>
                  <span className={`rounded border px-1.5 py-0.5 ${levelBadgeClass(issue.level)}`}>
                    {issue.level}
                  </span>
                  <span className="text-slate-500">{issue.shortId}</span>
                  <span className="ml-auto text-slate-500">{formatRelative(issue.lastSeen)}</span>
                </div>
                <div className="mt-1 truncate text-sm font-medium text-slate-100">{issue.title}</div>
                {issue.culprit && (
                  <div className="truncate text-xs text-slate-400">{issue.culprit}</div>
                )}
                <div className="mt-1 text-xs text-slate-500">events: {issue.count}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">詳細</h2>
          {selectedFromList && (
            <a
              href={selectedFromList.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sky-300 hover:underline"
            >
              Sentry で開く ↗
            </a>
          )}
        </header>
        <div className="px-4 py-4">
          {!selectedId && (
            <p className="text-sm text-slate-400">左側のリストから Issue を選択してください</p>
          )}
          {detailState.kind === "loading" && <p className="text-sm text-slate-400">読み込み中...</p>}
          {detailState.kind === "error" && (
            <p className="text-sm text-red-300">エラー: {detailState.message}</p>
          )}
          {detailState.kind === "ready" && <DetailView detail={detailState.detail} onCopy={handleCopy} />}
          {copyHint && <p className="mt-3 text-xs text-emerald-300">{copyHint}</p>}
        </div>
      </section>
    </div>
  );
}

function DetailView({
  detail,
  onCopy,
}: {
  detail: IssueDetail;
  onCopy: (d: IssueDetail) => void;
}) {
  const exceptionEntry = detail.latestEvent?.entries.find((e) => e.type === "exception");
  const frames = exceptionEntry ? extractFrames(exceptionEntry.data) : [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-100">{detail.title}</h3>
        {detail.culprit && <p className="text-sm text-slate-400">{detail.culprit}</p>}
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <span
            className={`rounded border px-1.5 py-0.5 ${projectTagClass(
              detail._projectTag ?? detail.project.slug,
            )}`}
          >
            {detail._projectTag ?? detail.project.slug}
          </span>
          <span className={`rounded border px-1.5 py-0.5 ${levelBadgeClass(detail.level)}`}>
            {detail.level}
          </span>
          <span>events: {detail.count}</span>
          <span>last: {formatRelative(detail.lastSeen)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onCopy(detail)}
          className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
        >
          Claude に聞く内容をコピー
        </button>
      </div>

      {frames.length > 0 && (
        <div className="rounded border border-slate-800 bg-slate-950/60">
          <header className="border-b border-slate-800 px-3 py-2 text-xs font-medium text-slate-400">
            Stack trace（上位 10 フレーム）
          </header>
          <ol className="divide-y divide-slate-800 font-mono text-xs">
            {frames.slice(0, 10).map((f, idx) => (
              <li key={idx} className="px-3 py-2">
                <div className="text-slate-300">
                  {f.function ?? "<anonymous>"}
                  {f.lineNo !== null && <span className="text-slate-500"> :{f.lineNo}</span>}
                </div>
                {f.filename && <div className="text-slate-500">{f.filename}</div>}
                {f.contextLine && (
                  <pre className="mt-1 overflow-x-auto rounded bg-slate-900 px-2 py-1 text-slate-200">
                    {f.contextLine}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {detail.latestEvent?.tags && detail.latestEvent.tags.length > 0 && (
        <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
          <div className="mb-1 font-medium text-slate-400">Tags</div>
          <div className="flex flex-wrap gap-1">
            {detail.latestEvent.tags.slice(0, 20).map((t) => (
              <span
                key={t.key}
                className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300"
              >
                {t.key}: {t.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type Frame = {
  function: string | null;
  filename: string | null;
  lineNo: number | null;
  contextLine: string | null;
};

function extractFrames(data: unknown): Frame[] {
  if (!data || typeof data !== "object") return [];
  const d = data as { values?: Array<{ stacktrace?: { frames?: unknown[] } }> };
  const firstException = d.values?.[0];
  const rawFrames = firstException?.stacktrace?.frames;
  if (!Array.isArray(rawFrames)) return [];
  return rawFrames
    .slice()
    .reverse()
    .map((raw: unknown) => {
      const f = raw as {
        function?: string;
        filename?: string;
        abs_path?: string;
        lineno?: number;
        context_line?: string;
      };
      return {
        function: f.function ?? null,
        filename: f.filename ?? f.abs_path ?? null,
        lineNo: typeof f.lineno === "number" ? f.lineno : null,
        contextLine: f.context_line ?? null,
      };
    });
}
