"use client";

import { useCallback, useEffect, useState } from "react";
import { TabDescription } from "./TabDescription";

type LogRow = {
  id: string;
  source: string;
  level: string;
  message: string;
  context: Record<string, unknown>;
  occurred_at: string;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; logs: LogRow[]; sources: string[] }
  | { kind: "error"; message: string };

function levelBadgeClass(level: string): string {
  if (level === "fatal" || level === "error") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (level === "warn") return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  if (level === "info") return "bg-sky-500/20 text-sky-300 border-sky-500/30";
  return "bg-slate-600/20 text-slate-300 border-slate-500/30";
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function ServiceLogsClient() {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [source, setSource] = useState<string>("");
  const [level, setLevel] = useState<string>("all");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams();
      if (source) params.set("source", source);
      if (level !== "all") params.set("level", level);
      params.set("hours", "24");
      params.set("limit", "200");
      const res = await fetch(`/api/admin/logs?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        logs: LogRow[];
        sources: string[];
      };
      setState({ kind: "ready", logs: json.logs, sources: json.sources });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, [source, level]);

  useEffect(() => {
    void load();
  }, [load]);

  const logs = state.kind === "ready" ? state.logs : [];
  const sources = state.kind === "ready" ? state.sources : [];

  return (
    <div className="space-y-4">
      <TabDescription>
        外部サービス (rezona など) から <code>/api/logs/ingest</code> 経由で受信した pino ログを表示します。
        Sentry 経由の Logs タブとは別系統で、portal の <code>service_logs</code> テーブルが直接受け皿です。
      </TabDescription>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">Service Logs (受信)</h2>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-400">source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            >
              <option value="">all</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-400">level</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            >
              {["all", "debug", "info", "warn", "error", "fatal"].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={state.kind === "loading"}
            className="ml-auto rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:opacity-60"
          >
            {state.kind === "loading" ? "読み込み中…" : "再読込"}
          </button>
        </header>

        <div className="divide-y divide-slate-800">
          {state.kind === "loading" && (
            <p className="px-4 py-6 text-sm text-slate-400">読み込み中...</p>
          )}
          {state.kind === "error" && (
            <p className="px-4 py-6 text-sm text-red-300">エラー: {state.message}</p>
          )}
          {state.kind === "ready" && logs.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400">
              該当するログはありません (24h)。受信エンドポイント未設定の場合、env{" "}
              <code>PORTAL_LOG_INGEST_TOKEN</code> を確認してください。
            </p>
          )}
          {logs.map((log) => (
            <article key={log.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded border px-1.5 py-0.5 ${levelBadgeClass(log.level)}`}>
                  {log.level}
                </span>
                <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">
                  {log.source}
                </span>
                <span className="ml-auto text-slate-500">{formatRelative(log.occurred_at)}</span>
              </div>
              <div className="mt-1 font-medium text-slate-100">{log.message}</div>
              {Object.keys(log.context).length > 0 && (
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400">
                  {JSON.stringify(log.context, null, 2)}
                </pre>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
