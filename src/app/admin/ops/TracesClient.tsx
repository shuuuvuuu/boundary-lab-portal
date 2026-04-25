"use client";

import { useCallback, useEffect, useState } from "react";

import type { SentryServiceKey } from "./IssuesClient";

type TransactionItem = {
  transaction: string;
  project: string;
  count: number;
  avgDuration: number;
  p50: number;
  p95: number;
  failureRate: number;
  _projectTag: string;
  _service: SentryServiceKey;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      transactions: TransactionItem[];
      statsPeriod: string;
      loadedAt: number;
      configured: boolean;
    }
  | { kind: "error"; message: string };

type PeriodOption = "1h" | "24h" | "7d";

function projectTagClass(tag: string): string {
  if (tag === "server") return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
  if (tag === "web") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  return "bg-slate-600/20 text-slate-300 border-slate-500/30";
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0) return "—";
  const pct = rate * 100;
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function failureRateClass(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "text-slate-400";
  if (rate >= 0.05) return "text-red-300";
  if (rate >= 0.01) return "text-amber-300";
  return "text-slate-300";
}

function p95Class(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "text-slate-400";
  if (ms >= 1000) return "text-red-300";
  if (ms >= 500) return "text-amber-300";
  return "text-slate-100";
}

export function TracesClient({ service }: { service: SentryServiceKey }) {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [period, setPeriod] = useState<PeriodOption>("24h");
  const [refreshing, setRefreshing] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const fetchTransactions = useCallback(
    async (statsPeriod: PeriodOption) => {
      setState({ kind: "loading" });
      try {
        const params = new URLSearchParams();
        params.set("service", service);
        params.set("statsPeriod", statsPeriod);
        const res = await fetch(`/api/admin/sentry/transactions?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          transactions: TransactionItem[];
          statsPeriod: string;
          configured?: boolean;
        };
        setState({
          kind: "ready",
          transactions: json.transactions,
          statsPeriod: json.statsPeriod,
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
    [service],
  );

  useEffect(() => {
    fetchTransactions(period);
  }, [fetchTransactions, period]);

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
      await fetchTransactions(period);
    } finally {
      setRefreshing(false);
    }
  }, [fetchTransactions, period, refreshing]);

  const transactions = state.kind === "ready" ? state.transactions : [];

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <h2 className="font-medium">Traces (transaction サマリ)</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs">
            {(["1h", "24h", "7d"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setPeriod(opt)}
                className={`rounded px-2 py-1 transition ${
                  period === opt
                    ? "bg-slate-700 text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
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
      {state.kind === "ready" && state.configured && transactions.length === 0 && (
        <div className="px-4 py-6 text-sm text-slate-400">
          <p>該当する transaction がありません。</p>
          <p className="mt-2 text-xs">
            Developer 無料プランは spans quota が 10K/月と厳しいので、
            <code className="mx-1 rounded bg-slate-800 px-1">SENTRY_TRACES_SAMPLE_RATE</code>
            を低めに設定している場合は期間内で記録が少ないことがあります。
          </p>
        </div>
      )}
      {state.kind === "ready" && state.configured && transactions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 text-xs text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Service</th>
                <th className="px-2 py-2 text-left font-medium">Transaction</th>
                <th className="px-2 py-2 text-right font-medium">Count</th>
                <th className="px-2 py-2 text-right font-medium">Avg</th>
                <th className="px-2 py-2 text-right font-medium">p50</th>
                <th className="px-2 py-2 text-right font-medium">p95</th>
                <th className="px-4 py-2 text-right font-medium">Failure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {transactions.map((tx, idx) => (
                <tr key={`${tx._projectTag}-${tx.transaction}-${idx}`} className="hover:bg-slate-900/60">
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-xs ${projectTagClass(tx._projectTag)}`}
                    >
                      {tx._projectTag}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-slate-200">
                    {tx.transaction || "(none)"}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-300 tabular-nums">
                    {tx.count.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-400 tabular-nums">
                    {formatMs(tx.avgDuration)}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-300 tabular-nums">
                    {formatMs(tx.p50)}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${p95Class(tx.p95)}`}>
                    {formatMs(tx.p95)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${failureRateClass(tx.failureRate)}`}>
                    {formatRate(tx.failureRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {copyHint && <p className="px-4 pb-3 text-xs text-emerald-300">{copyHint}</p>}
    </section>
  );
}
