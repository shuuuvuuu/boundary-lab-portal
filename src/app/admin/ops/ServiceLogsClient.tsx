"use client";

import { useCallback, useEffect, useState } from "react";
import { TabDescription } from "./TabDescription";
import { TimeRangeSelector, type TimeRange } from "./TimeRangeSelector";

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
  const [period, setPeriod] = useState<TimeRange>("24h");
  const [deleting, setDeleting] = useState<false | "24h" | "7d" | "all">(false);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams();
      if (source) params.set("source", source);
      if (level !== "all") params.set("level", level);
      params.set("period", period);
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
  }, [source, level, period]);

  const runDelete = useCallback(
    async (kind: "24h" | "7d" | "all") => {
      setDeleting(kind);
      setDeleteError(null);
      try {
        const params = new URLSearchParams();
        if (kind === "all") {
          params.set("all", "true");
        } else {
          const ms = kind === "24h" ? 86_400_000 : 7 * 86_400_000;
          params.set("before", new Date(Date.now() - ms).toISOString());
        }
        const res = await fetch(`/api/admin/logs?${params.toString()}`, {
          method: "DELETE",
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        await load();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "unknown error");
      } finally {
        setDeleting(false);
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const logs = state.kind === "ready" ? state.logs : [];
  const sources = state.kind === "ready" ? state.sources : [];
  const deleteDisabled = deleting !== false || state.kind === "loading";

  return (
    <div className="space-y-4">
      <TabDescription>
        外部サービス (現在は rezona-server / rezona-admin) から受信した warn 以上の
        構造化ログを表示します。送信側は pino を
        <code className="mx-1 rounded bg-slate-800 px-1">/api/logs/ingest</code>
        に POST、portal の
        <code className="mx-1 rounded bg-slate-800 px-1">service_logs</code>
        テーブルに 30 日保持。Sentry 経由ではなく portal 自身が直接受け皿になる経路で、
        source / level / 自由文字列で絞り込み可能です。古いログは「24 時間以前を削除」
        「7 日以前を削除」「全削除」のメニューから一括掃除できます。
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
          <TimeRangeSelector value={period} onChange={setPeriod} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runDelete("24h")}
              disabled={deleteDisabled}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:opacity-60"
            >
              {deleting === "24h" ? "削除中…" : "24h 以前を削除"}
            </button>
            <button
              type="button"
              onClick={() => void runDelete("7d")}
              disabled={deleteDisabled}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:opacity-60"
            >
              {deleting === "7d" ? "削除中…" : "7d 以前を削除"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAllOpen(true)}
              disabled={deleteDisabled}
              className="rounded border border-red-700 bg-red-900/40 px-3 py-1 text-xs text-red-200 hover:bg-red-900/60 disabled:opacity-60"
            >
              {deleting === "all" ? "削除中…" : "全削除"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={deleteDisabled}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:opacity-60"
            >
              {state.kind === "loading" ? "読み込み中…" : "再読込"}
            </button>
          </div>
        </header>

        {deleteError && (
          <p className="border-b border-slate-800 px-4 py-2 text-xs text-red-300">
            削除エラー: {deleteError}
          </p>
        )}

        <div className="divide-y divide-slate-800">
          {state.kind === "loading" && (
            <p className="px-4 py-6 text-sm text-slate-400">読み込み中...</p>
          )}
          {state.kind === "error" && (
            <p className="px-4 py-6 text-sm text-red-300">エラー: {state.message}</p>
          )}
          {state.kind === "ready" && logs.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400">
              該当するログはありません。受信エンドポイント未設定の場合、env{" "}
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

      {confirmAllOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmAllOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-logs-delete-all-title"
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="service-logs-delete-all-title" className="text-lg font-medium text-slate-100">
              全件削除しますか?
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              service_logs テーブルの全 row が削除されます。この操作は取り消せません。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAllOpen(false)}
                disabled={deleting !== false}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmAllOpen(false);
                  await runDelete("all");
                }}
                disabled={deleting !== false}
                className="rounded border border-red-700 bg-red-900/60 px-3 py-1 text-xs text-red-100 hover:bg-red-900 disabled:opacity-60"
              >
                OK (全削除)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
