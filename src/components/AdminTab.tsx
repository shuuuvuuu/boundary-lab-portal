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

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-bold">運用ダッシュボード (Feat-014)</h2>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="admin-month-select">対象月</label>
          <select
            id="admin-month-select"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-black bg-white px-2 py-1"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="border border-dashed border-black bg-yellow-50 px-3 py-2 text-xs">
        ⚠ モック表示中: 数値はダミーです。対象月セレクタも UI
        モックで、切り替えても値は変わりません。Phase 3 で Reticulum DB +
        mediasoup-exporter から実データを取得予定。
      </p>

      <div className="overflow-x-auto border border-black">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-3 py-2 text-left">ルーム名</th>
              <th className="px-3 py-2 text-right">月間利用日数(日)</th>
              <th className="px-3 py-2 text-right">延べ人時(h)</th>
              <th className="px-3 py-2 text-right">同時接続ピーク(人)</th>
              <th className="px-3 py-2 text-right">UU(人)</th>
              <th className="px-3 py-2 text-right">推定通信量(MB)</th>
              <th className="px-3 py-2 text-right">推定按分コスト(円)</th>
            </tr>
          </thead>
          <tbody>
            {dummyRows.map((r) => (
              <tr key={r.room} className="border-t border-black">
                <td className="px-3 py-2">{r.room}</td>
                <td className="px-3 py-2 text-right">{r.days}</td>
                <td className="px-3 py-2 text-right">{r.personHours.toFixed(1)}</td>
                <td className="px-3 py-2 text-right">{r.peak}</td>
                <td className="px-3 py-2 text-right">{r.uu}</td>
                <td className="px-3 py-2 text-right">{r.trafficMB.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{r.costJpy.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-black bg-neutral-100 font-bold">
            <tr>
              <th scope="row" className="px-3 py-2 text-left">
                合計<span className="font-normal text-xs">（ピークのみ平均）</span>
              </th>
              <td className="px-3 py-2 text-right">{totals.days}</td>
              <td className="px-3 py-2 text-right">{totals.personHours.toFixed(1)}</td>
              <td className="px-3 py-2 text-right">{totals.peakAvg}</td>
              <td className="px-3 py-2 text-right">{totals.uu}</td>
              <td className="px-3 py-2 text-right">{totals.trafficMB.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{totals.costJpy.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
