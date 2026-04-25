"use client";

import { useEffect, useMemo, useState } from "react";

import type { SentryServiceKey } from "./IssuesClient";

type Span = {
  span_id: string;
  parent_span_id?: string | null;
  op?: string | null;
  description?: string | null;
  start_timestamp: number;
  timestamp: number;
  status?: string | null;
};

type TransactionDetail = {
  eventID: string;
  transaction: string;
  project: string;
  startTimestamp: number;
  endTimestamp: number;
  durationMs: number;
  rootOp: string | null;
  spans: Span[];
  permalink: string;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; detail: TransactionDetail | null; configured: boolean }
  | { kind: "error"; message: string };

type Props = {
  service: SentryServiceKey;
  projectTag: string;
  transaction: string;
  statsPeriod: string;
  onClose: () => void;
};

function opColor(op: string | null | undefined): string {
  const o = (op ?? "").toLowerCase();
  if (o.startsWith("db") || o.startsWith("pg")) return "bg-emerald-500/40 border-emerald-400/60";
  if (o.startsWith("http")) return "bg-sky-500/40 border-sky-400/60";
  if (o.startsWith("cache") || o.startsWith("redis")) return "bg-pink-500/40 border-pink-400/60";
  if (o.startsWith("rpc") || o.startsWith("grpc")) return "bg-purple-500/40 border-purple-400/60";
  if (o.startsWith("middleware") || o.startsWith("express")) return "bg-amber-500/30 border-amber-400/50";
  if (o.startsWith("socket")) return "bg-fuchsia-500/40 border-fuchsia-400/60";
  return "bg-slate-500/40 border-slate-400/60";
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function TraceDetailPanel({
  service,
  projectTag,
  transaction,
  statsPeriod,
  onClose,
}: Props) {
  const [state, setState] = useState<FetchState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const params = new URLSearchParams({
      service,
      projectTag,
      transaction,
      statsPeriod,
    });
    fetch(`/api/admin/sentry/transaction-detail?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { detail: TransactionDetail | null; configured?: boolean };
      })
      .then((json) => {
        if (cancelled) return;
        setState({
          kind: "ready",
          detail: json.detail,
          configured: json.configured !== false,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [service, projectTag, transaction, statsPeriod]);

  // span を timeline 化（root start 起点・rootDuration 比率で left/width）
  const timeline = useMemo(() => {
    if (state.kind !== "ready" || !state.detail) return null;
    const { startTimestamp, endTimestamp, spans } = state.detail;
    const totalSec = Math.max(0.001, endTimestamp - startTimestamp);
    const rows = spans
      .map((s) => {
        const start = Math.max(0, s.start_timestamp - startTimestamp);
        const end = Math.max(start, s.timestamp - startTimestamp);
        const leftPct = (start / totalSec) * 100;
        const widthPct = Math.max(0.5, ((end - start) / totalSec) * 100);
        return {
          span: s,
          leftPct,
          widthPct,
          durationMs: (end - start) * 1000,
          startMs: start * 1000,
        };
      })
      .sort((a, b) => a.startMs - b.startMs);
    return { rows, totalMs: totalSec * 1000 };
  }, [state]);

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900/80">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-slate-100">{transaction}</h3>
          <p className="text-xs text-slate-400">
            <span
              className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${
                projectTag === "server"
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              }`}
            >
              {projectTag}
            </span>{" "}
            最新 event の span tree
          </p>
        </div>
        <button
          onClick={onClose}
          type="button"
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
        >
          閉じる
        </button>
      </header>

      <div className="px-4 py-3">
        {state.kind === "loading" && (
          <p className="py-8 text-center text-sm text-slate-400">spans を読み込み中...</p>
        )}
        {state.kind === "error" && (
          <p className="py-8 text-center text-sm text-red-300">エラー: {state.message}</p>
        )}
        {state.kind === "ready" && !state.configured && (
          <p className="py-8 text-center text-sm text-amber-300">Sentry 未設定</p>
        )}
        {state.kind === "ready" && state.configured && !state.detail && (
          <p className="py-8 text-center text-sm text-slate-400">
            該当 transaction の event が見つかりません（期間内に sample されていない可能性）
          </p>
        )}
        {state.kind === "ready" && state.detail && timeline && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>
                duration: <span className="text-slate-100">{formatMs(state.detail.durationMs)}</span>
              </span>
              <span>
                spans: <span className="text-slate-100">{state.detail.spans.length}</span>
              </span>
              {state.detail.rootOp && (
                <span>
                  root op: <span className="text-slate-100">{state.detail.rootOp}</span>
                </span>
              )}
              <a
                href={state.detail.permalink}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-sky-300 hover:underline"
              >
                Sentry で開く ↗
              </a>
            </div>

            {timeline.rows.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">
                child span がありません（root のみ計測）
              </p>
            )}

            {timeline.rows.length > 0 && (
              <div className="space-y-1">
                {timeline.rows.map((row) => (
                  <div
                    key={row.span.span_id}
                    className="grid grid-cols-[1fr_3fr_auto] items-center gap-2 text-xs"
                  >
                    <div className="min-w-0 truncate" title={`${row.span.op ?? ""}: ${row.span.description ?? ""}`}>
                      <span className="font-mono text-slate-300">{row.span.op ?? "(no op)"}</span>
                      {row.span.description && (
                        <span className="ml-1 text-slate-500">— {row.span.description}</span>
                      )}
                    </div>
                    <div className="relative h-4 rounded bg-slate-800/60">
                      <div
                        className={`absolute h-full rounded border ${opColor(row.span.op)}`}
                        style={{
                          left: `${row.leftPct}%`,
                          width: `${row.widthPct}%`,
                        }}
                      />
                    </div>
                    <div className="text-right tabular-nums text-slate-400">
                      {formatMs(row.durationMs)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
