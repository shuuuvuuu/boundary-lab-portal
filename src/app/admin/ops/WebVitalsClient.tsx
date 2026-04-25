"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SentryServiceKey } from "./IssuesClient";
import { TabDescription } from "./TabDescription";

type Vital = "lcp" | "fcp" | "cls" | "inp" | "ttfb";

type Summary = {
  lcp?: number;
  fcp?: number;
  cls?: number;
  inp?: number;
  ttfb?: number;
  count: number;
  project: string;
};

type SeriesPoint = { time: number; value: number };
type Series = { key: string; project: string; points: SeriesPoint[] };

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      summary: Summary | null;
      series: Series | null;
      configured: boolean;
    }
  | { kind: "error"; message: string };

type PeriodOption = "1h" | "24h" | "7d";

/**
 * Core Web Vitals threshold (Google 2026 ガイド準拠)。
 * good = 上限以下なら良好、poor = 上限超で 不良、間が needs improvement
 */
const THRESHOLDS: Record<Vital, { good: number; poor: number; unit: "ms" | "" }> = {
  lcp: { good: 2500, poor: 4000, unit: "ms" },
  fcp: { good: 1800, poor: 3000, unit: "ms" },
  cls: { good: 0.1, poor: 0.25, unit: "" },
  inp: { good: 200, poor: 500, unit: "ms" },
  ttfb: { good: 800, poor: 1800, unit: "ms" },
};

const VITAL_LABELS: Record<Vital, string> = {
  lcp: "LCP",
  fcp: "FCP",
  cls: "CLS",
  inp: "INP",
  ttfb: "TTFB",
};

const VITAL_DESCRIPTIONS: Record<Vital, string> = {
  lcp: "Largest Contentful Paint — メイン要素が表示されるまでの時間",
  fcp: "First Contentful Paint — 最初の要素が表示されるまでの時間",
  cls: "Cumulative Layout Shift — レイアウトが動く量（無次元）",
  inp: "Interaction to Next Paint — 操作レスポンスの代表値（FID 後継）",
  ttfb: "Time to First Byte — リクエストから最初の応答バイトまで",
};

function rate(value: number | undefined, vital: Vital): "good" | "needs" | "poor" | "—" {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const t = THRESHOLDS[vital];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs";
  return "poor";
}

function rateClass(r: "good" | "needs" | "poor" | "—"): string {
  if (r === "good") return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
  if (r === "needs") return "text-amber-300 border-amber-500/40 bg-amber-500/10";
  if (r === "poor") return "text-red-300 border-red-500/40 bg-red-500/10";
  return "text-slate-400 border-slate-700 bg-slate-800/30";
}

function formatVitalValue(value: number | undefined, vital: Vital): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (vital === "cls") return value.toFixed(3);
  if (value < 1000) return `${value.toFixed(0)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function formatTimeLabel(unixSec: number, statsPeriod: string): string {
  const d = new Date(unixSec * 1000);
  if (statsPeriod === "1h" || statsPeriod === "24h") {
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function WebVitalsClient({ service }: { service: SentryServiceKey }) {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [period, setPeriod] = useState<PeriodOption>("24h");
  const [selectedVital, setSelectedVital] = useState<Vital>("lcp");

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const params = new URLSearchParams({ service, statsPeriod: period, vital: selectedVital });
    fetch(`/api/admin/sentry/web-vitals?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as {
          summary: Summary | null;
          series: Series | null;
          configured?: boolean;
        };
      })
      .then((json) => {
        if (cancelled) return;
        setState({
          kind: "ready",
          summary: json.summary,
          series: json.series,
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
  }, [service, period, selectedVital]);

  const chartData = useMemo(() => {
    if (state.kind !== "ready" || !state.series) return [] as Array<{ time: number; value: number }>;
    return state.series.points;
  }, [state]);

  const summary = state.kind === "ready" ? state.summary : null;
  const t = THRESHOLDS[selectedVital];

  return (
    <div className="space-y-4">
      <TabDescription>
        <strong className="text-slate-200">Web Vitals</strong>（LCP / FCP / CLS / INP / TTFB）を
        boundary web (apps/web) の本番ユーザー体感ベースで p75 表示します。
        Google の Core Web Vitals 閾値（good / needs improvement / poor）に従って色付け。
        サンプリング元は `@sentry/react` の Browser Tracing。
      </TabDescription>

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        {summary && (
          <span className="text-xs text-slate-400">
            sample 数: <span className="text-slate-200">{summary.count.toLocaleString()}</span>
          </span>
        )}
      </div>

      {state.kind === "loading" && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-12 text-center text-sm text-slate-400">
          読み込み中...
        </p>
      )}
      {state.kind === "error" && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-12 text-center text-sm text-red-300">
          エラー: {state.message}
        </p>
      )}
      {state.kind === "ready" && !state.configured && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-12 text-center text-sm text-amber-300">
          {service} の Sentry web project が未設定です
        </p>
      )}
      {state.kind === "ready" && state.configured && summary && summary.count === 0 && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-12 text-center text-sm text-slate-400">
          該当期間に web の transaction が記録されていません
        </p>
      )}
      {state.kind === "ready" && state.configured && summary && summary.count > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(Object.keys(VITAL_LABELS) as Vital[]).map((v) => {
              const value = summary[v];
              const r = rate(value, v);
              const isSelected = selectedVital === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSelectedVital(v)}
                  className={`rounded-lg border px-4 py-3 text-left transition ${rateClass(r)} ${
                    isSelected ? "ring-2 ring-sky-400" : ""
                  } hover:brightness-110`}
                  title={VITAL_DESCRIPTIONS[v]}
                >
                  <div className="text-xs font-medium opacity-80">{VITAL_LABELS[v]}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatVitalValue(value, v)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide opacity-70">
                    {r === "good" ? "Good" : r === "needs" ? "Needs improvement" : r === "poor" ? "Poor" : "no data"}
                  </div>
                </button>
              );
            })}
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40">
            <header className="border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-medium text-slate-200">
                {VITAL_LABELS[selectedVital]} の時系列 (p75)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">{VITAL_DESCRIPTIONS[selectedVital]}</p>
            </header>
            <div className="px-2 py-3" style={{ height: 280 }}>
              {chartData.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-slate-400">
                  時系列データがありません
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={(t: number) => formatTimeLabel(t, period)}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      stroke="#334155"
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatVitalValue(v, selectedVital)}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      stroke="#334155"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #334155",
                        fontSize: 12,
                      }}
                      labelFormatter={(t) => formatTimeLabel(Number(t), period)}
                      formatter={(value) => formatVitalValue(Number(value), selectedVital)}
                    />
                    <ReferenceLine
                      y={t.good}
                      stroke="#34d399"
                      strokeDasharray="3 3"
                      label={{ value: "good", fill: "#34d399", fontSize: 10, position: "right" }}
                    />
                    <ReferenceLine
                      y={t.poor}
                      stroke="#f87171"
                      strokeDasharray="3 3"
                      label={{ value: "poor", fill: "#f87171", fontSize: 10, position: "right" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
