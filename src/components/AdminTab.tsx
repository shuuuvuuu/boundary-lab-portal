"use client";

import { useEffect, useMemo, useState } from "react";
import { toJstMonthString } from "@/lib/time/jst";
import type {
  AdminRoomMonthsResponse,
  AdminRoomStatsResponse,
} from "@/types/admin";

const PHASE_B_PLACEHOLDER = "— (Phase B待ち)";
const EMPTY_ROWS: AdminRoomStatsResponse["rows"] = [];

export function AdminTab() {
  const currentMonth = getCurrentMonth();
  const [months, setMonths] = useState<string[]>([currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<AdminRoomStatsResponse | null>(null);
  const [monthsLoading, setMonthsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMonths() {
      setMonthsLoading(true);

      try {
        const response = await fetchJson<AdminRoomMonthsResponse>(
          "/api/admin/rooms/months",
          controller.signal,
        );
        if (controller.signal.aborted) return;

        const nextMonths =
          response.months.length > 0 ? response.months : [currentMonth];
        setMonths(nextMonths);

        setMonth((current) =>
          nextMonths.includes(current) ? current : nextMonths[nextMonths.length - 1],
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setMonths([currentMonth]);
        setErrorMessage(toErrorMessage(err, "月一覧の取得に失敗しました。"));
      } finally {
        if (!controller.signal.aborted) {
          setMonthsLoading(false);
        }
      }
    }

    void loadMonths();

    return () => controller.abort();
  }, [currentMonth]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStats() {
      setStatsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetchJson<AdminRoomStatsResponse>(
          `/api/admin/rooms/stats?month=${encodeURIComponent(month)}`,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setData(response);
      } catch (err) {
        if (controller.signal.aborted) return;
        setData(null);
        setErrorMessage(toErrorMessage(err, "ダッシュボードの取得に失敗しました。"));
      } finally {
        if (!controller.signal.aborted) {
          setStatsLoading(false);
        }
      }
    }

    void loadStats();

    return () => controller.abort();
  }, [month]);

  const rows = data?.rows ?? EMPTY_ROWS;
  const unresolvedRoomCount = data ? Math.max(0, data.roomCount - data.roomNameResolvedCount) : 0;
  const totals = useMemo(() => {
    const peakValues = rows
      .map((row) => row.peakConcurrent)
      .filter((value): value is number => typeof value === "number");

    return {
      activeDays: rows.reduce((sum, row) => sum + row.activeDays, 0),
      entryCount: rows.reduce((sum, row) => sum + row.entryCount, 0),
      totalStaySeconds: rows.reduce((sum, row) => sum + row.totalStaySeconds, 0),
      uniqueVisitors: rows.reduce((sum, row) => sum + row.uniqueVisitors, 0),
      averagePeak:
        peakValues.length > 0
          ? Math.round((peakValues.reduce((sum, value) => sum + value, 0) / peakValues.length) * 10) /
            10
          : null,
    };
  }, [rows]);

  const stats = [
    { label: "対象ルーム", value: rows.length, unit: "部屋" },
    { label: "入室数", value: totals.entryCount.toLocaleString(), unit: "回" },
    { label: "延べ人時", value: formatHours(totals.totalStaySeconds), unit: "h" },
    { label: "UU 合計", value: totals.uniqueVisitors.toLocaleString(), unit: "人" },
  ];

  const isEmpty = !statsLoading && !errorMessage && rows.length === 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="admin-month-select" className="text-slate-400">
            対象月
          </label>
          <select
            id="admin-month-select"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={monthsLoading}
            className="rounded-md border border-white/10 bg-bg-primary px-3 py-1.5 text-white outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {months.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 ring-1 ring-white/10">
          room_entry_events 実データ
        </span>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage && data && rows.length > 0 && unresolvedRoomCount > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {data.roomNameResolvedCount}/{data.roomCount} ルームのみ名前解決済。残りは hub_id 表示です。
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/5 bg-bg-secondary/40 p-4 shadow-card"
          >
            <p className="text-xs text-slate-400">{stat.label}</p>
            <p className="mt-1 text-lg font-bold text-white">
              {stat.value}
              {stat.unit ? (
                <span className="ml-1 text-xs font-normal text-slate-400">{stat.unit}</span>
              ) : null}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/5 bg-bg-secondary/40 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">ルーム名</th>
                <th className="px-4 py-3 text-right font-medium">月間利用日数(日)</th>
                <th className="px-4 py-3 text-right font-medium">延べ人時(h)</th>
                <th className="px-4 py-3 text-right font-medium">同時接続ピーク(人)</th>
                <th className="px-4 py-3 text-right font-medium">UU(人)</th>
                <th className="px-4 py-3 text-right font-medium">推定通信量(MB)</th>
                <th className="px-4 py-3 text-right font-medium">推定按分コスト(円)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {statsLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    読み込み中...
                  </td>
                </tr>
              ) : null}

              {!statsLoading &&
                rows.map((row) => (
                  <tr key={row.hubId} className="transition hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-medium text-white">
                      <div>{row.roomName ?? row.hubId}</div>
                      {row.roomName ? (
                        <div className="mt-1 text-xs font-normal text-slate-500">{row.hubId}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200">{row.activeDays}</td>
                    <td className="px-4 py-3 text-right text-slate-200">
                      {formatHours(row.totalStaySeconds)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200">
                      {formatPeak(row.peakConcurrent)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200">
                      {row.uniqueVisitors.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{PHASE_B_PLACEHOLDER}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{PHASE_B_PLACEHOLDER}</td>
                  </tr>
                ))}

              {isEmpty ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    対象月の入退室データはありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot className="border-t-2 border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider">
              <tr>
                <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-300">
                  合計
                  <span className="ml-1 text-[10px] font-normal text-slate-500">
                    (ピークのみ平均)
                  </span>
                </th>
                <td className="px-4 py-3 text-right font-semibold text-white">
                  {totals.activeDays.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-white">
                  {formatHours(totals.totalStaySeconds)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-white">
                  {formatPeak(totals.averagePeak)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-white">
                  {totals.uniqueVisitors.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-400">
                  {PHASE_B_PLACEHOLDER}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-400">
                  {PHASE_B_PLACEHOLDER}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        集計元: Supabase <code>public.room_entry_events</code>。ピーク同時接続は未実装のため
        プレースホルダ表示です。
        {data && data.ongoingSessions > 0
          ? ` ${data.ongoingSessions} 件は在室中のため現時点までを集計し、対象月を超える分は月末 23:59:59 JST で打ち切っています。`
          : null}
      </p>
    </section>
  );
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & T)
    | null;

  if (!response.ok) {
    throw new ApiError(response.status, typeof payload?.error === "string" ? payload.error : null);
  }

  return payload as T;
}

function formatHours(totalStaySeconds: number): string {
  return (totalStaySeconds / 3600).toFixed(1);
}

function formatPeak(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

function getCurrentMonth(): string {
  return toJstMonthString(new Date());
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "認証済みセッションが必要です。";
    if (error.status === 403 && error.messageText === "verified email required") {
      return "運営タブは確認済みメールアドレスの連携後に利用できます。";
    }
    if (error.status === 403) return "enterprise プランのみ利用できます。";
    if (error.status === 400 && error.messageText) return `不正なリクエストです: ${error.messageText}`;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return fallback;
  }

  return fallback;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messageText: string | null,
  ) {
    super(messageText ?? `API request failed with status ${status}`);
  }
}
