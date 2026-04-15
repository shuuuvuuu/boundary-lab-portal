"use client";

import { useMemo, useState } from "react";

type Row = {
  room: string;
  days: number;
  personHours: number;
  peak: number;
  uu: number;
  trafficMB: number;
  costJpy: number;
};

const dummyRows: Row[] = [
  { room: "Cowork Hub",     days: 22, personHours: 118.5, peak: 9,  uu: 28, trafficMB: 5120, costJpy: 980 },
  { room: "Event Hall",     days: 6,  personHours:  74.0, peak: 24, uu: 61, trafficMB: 8340, costJpy: 1610 },
  { room: "Meeting Room A", days: 18, personHours:  52.0, peak: 5,  uu: 14, trafficMB: 2260, costJpy: 430 },
  { room: "Gallery",        days: 12, personHours:  36.5, peak: 7,  uu: 22, trafficMB: 3180, costJpy: 610 },
  { room: "Showcase Room",  days: 9,  personHours:  21.0, peak: 4,  uu: 11, trafficMB: 1480, costJpy: 290 },
];

const months = ["2026-02", "2026-03", "2026-04"];

export function AdminTab() {
  const [month, setMonth] = useState(months[months.length - 1]);

  const totals = useMemo(() => {
    const sum = (key: keyof Omit<Row, "room" | "peak">) =>
      dummyRows.reduce((acc, r) => acc + r[key], 0);
    const avgPeak =
      dummyRows.reduce((acc, r) => acc + r.peak, 0) / dummyRows.length;
    return {
      days: sum("days"),
      personHours: sum("personHours"),
      peakAvg: Math.round(avgPeak * 10) / 10,
      uu: sum("uu"),
      trafficMB: sum("trafficMB"),
      costJpy: sum("costJpy"),
    };
  }, []);

  const stats = [
    { label: "対象ルーム", value: dummyRows.length, unit: "部屋" },
    { label: "延べ人時", value: totals.personHours.toFixed(1), unit: "h" },
    { label: "UU 合計", value: totals.uu.toLocaleString(), unit: "人" },
    { label: "推定按分コスト", value: `¥${totals.costJpy.toLocaleString()}`, unit: "" },
  ];

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
            className="rounded-md border border-white/10 bg-bg-primary px-3 py-1.5 text-white outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300 ring-1 ring-amber-500/30">
          ⚠ モック表示中 / 対象月セレクタも UI モック
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/5 bg-bg-secondary/40 p-4 shadow-card"
          >
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="mt-1 text-lg font-bold text-white">
              {s.value}
              {s.unit && <span className="ml-1 text-xs font-normal text-slate-400">{s.unit}</span>}
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
              {dummyRows.map((r) => (
                <tr key={r.room} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium text-white">{r.room}</td>
                  <td className="px-4 py-3 text-right text-slate-200">{r.days}</td>
                  <td className="px-4 py-3 text-right text-slate-200">{r.personHours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right text-slate-200">{r.peak}</td>
                  <td className="px-4 py-3 text-right text-slate-200">{r.uu}</td>
                  <td className="px-4 py-3 text-right text-slate-200">{r.trafficMB.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-200">{r.costJpy.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider">
              <tr>
                <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-300">
                  合計
                  <span className="ml-1 text-[10px] font-normal text-slate-500">
                    (ピークのみ平均)
                  </span>
                </th>
                <td className="px-4 py-3 text-right font-semibold text-white">{totals.days}</td>
                <td className="px-4 py-3 text-right font-semibold text-white">
                  {totals.personHours.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-white">{totals.peakAvg}</td>
                <td className="px-4 py-3 text-right font-semibold text-white">{totals.uu}</td>
                <td className="px-4 py-3 text-right font-semibold text-white">
                  {totals.trafficMB.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-white">
                  {totals.costJpy.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Phase 3 で Reticulum DB + mediasoup-exporter から実データを取得予定。
      </p>
    </section>
  );
}
