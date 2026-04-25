"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SentryServiceKey } from "./IssuesClient";

type SeriesPoint = { time: number; value: number };

type SeriesItem = {
  key: string;
  project: string;
  points: SeriesPoint[];
  _projectTag: string;
  _service: SentryServiceKey;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      series: SeriesItem[];
      yAxis: "p95" | "p50" | "count";
      statsPeriod: string;
      configured: boolean;
    }
  | { kind: "error"; message: string };

type Props = {
  service: SentryServiceKey;
  statsPeriod: "1h" | "24h" | "7d";
};

const COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee"];

function formatTimeLabel(unixSec: number, statsPeriod: string): string {
  const d = new Date(unixSec * 1000);
  if (statsPeriod === "1h" || statsPeriod === "24h") {
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatValue(value: number, yAxis: "p95" | "p50" | "count"): string {
  if (yAxis === "count") return value.toFixed(0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1) return `${value.toFixed(2)}ms`;
  if (value < 1000) return `${value.toFixed(0)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function shortLabel(key: string): string {
  if (key.length <= 30) return key;
  return key.slice(0, 28) + "…";
}

export function TracesChart({ service, statsPeriod }: Props) {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [yAxis, setYAxis] = useState<"p95" | "p50" | "count">("p95");

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const params = new URLSearchParams({ service, statsPeriod, yAxis });
    fetch(`/api/admin/sentry/transactions-stats?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as {
          series: SeriesItem[];
          yAxis: "p95" | "p50" | "count";
          statsPeriod: string;
          configured?: boolean;
        };
      })
      .then((json) => {
        if (cancelled) return;
        setState({
          kind: "ready",
          series: json.series,
          yAxis: json.yAxis,
          statsPeriod: json.statsPeriod,
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
  }, [service, statsPeriod, yAxis]);

  // Recharts は「行ごとに 1 オブジェクト、各シリーズが各キー」の形を要求するので
  // 全シリーズの time をマージしてキー名を column とする形に変換する。
  const chartData = useMemo(() => {
    if (state.kind !== "ready") return [] as Array<Record<string, number>>;
    const timeKeys = new Set<number>();
    for (const s of state.series) for (const p of s.points) timeKeys.add(p.time);
    const sortedTimes = Array.from(timeKeys).sort((a, b) => a - b);
    return sortedTimes.map((t) => {
      const row: Record<string, number> = { time: t };
      for (const s of state.series) {
        const p = s.points.find((pt) => pt.time === t);
        const colName = `${s._projectTag}: ${shortLabel(s.key)}`;
        if (p) row[colName] = p.value;
      }
      return row;
    });
  }, [state]);

  const seriesNames = useMemo(() => {
    if (state.kind !== "ready") return [] as string[];
    return state.series.map((s) => `${s._projectTag}: ${shortLabel(s.key)}`);
  }, [state]);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-medium text-slate-200">時系列グラフ (上位 5 transaction)</h3>
        <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs">
          {(["p95", "p50", "count"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setYAxis(opt)}
              className={`rounded px-2 py-1 transition ${
                yAxis === opt ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </header>
      <div className="px-2 py-3" style={{ height: 280 }}>
        {state.kind === "loading" && (
          <p className="px-4 py-12 text-center text-sm text-slate-400">グラフを読み込み中...</p>
        )}
        {state.kind === "error" && (
          <p className="px-4 py-12 text-center text-sm text-red-300">エラー: {state.message}</p>
        )}
        {state.kind === "ready" && !state.configured && (
          <p className="px-4 py-12 text-center text-sm text-amber-300">
            {service} の Sentry 連携は未設定です
          </p>
        )}
        {state.kind === "ready" && state.configured && chartData.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-slate-400">
            該当期間に transaction の時系列データがありません
          </p>
        )}
        {state.kind === "ready" && state.configured && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                tickFormatter={(t: number) => formatTimeLabel(t, state.statsPeriod)}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                stroke="#334155"
              />
              <YAxis
                tickFormatter={(v: number) => formatValue(v, state.yAxis)}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                stroke="#334155"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  fontSize: 12,
                }}
                labelFormatter={(t) =>
                  formatTimeLabel(Number(t), state.statsPeriod === "1h" ? "24h" : state.statsPeriod)
                }
                formatter={(value) => formatValue(Number(value), state.yAxis)}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              {seriesNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
