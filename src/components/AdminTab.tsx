"use client";

const dummyRows = [
  {
    room: "Cowork Hub (sample)",
    days: 20,
    personHours: 42.5,
    peak: 6,
    uu: 12,
    trafficMB: 1820,
    costJpy: 350,
  },
];

export function AdminTab() {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-bold">運用ダッシュボード (Feat-014 実装予定地)</h2>
      <p className="text-sm text-neutral-600">
        Phase 3 で Reticulum DB + mediasoup-exporter から実データを取得予定。以下はダミー表示。
      </p>
      <div className="overflow-x-auto border border-black">
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-3 py-2 text-left">ルーム名</th>
              <th className="px-3 py-2 text-right">月間利用日数</th>
              <th className="px-3 py-2 text-right">延べ人時</th>
              <th className="px-3 py-2 text-right">同時接続ピーク</th>
              <th className="px-3 py-2 text-right">UU</th>
              <th className="px-3 py-2 text-right">推定通信量(MB)</th>
              <th className="px-3 py-2 text-right">推定按分コスト(円)</th>
            </tr>
          </thead>
          <tbody>
            {dummyRows.map((r) => (
              <tr key={r.room} className="border-t border-black">
                <td className="px-3 py-2">{r.room}</td>
                <td className="px-3 py-2 text-right">{r.days}</td>
                <td className="px-3 py-2 text-right">{r.personHours}</td>
                <td className="px-3 py-2 text-right">{r.peak}</td>
                <td className="px-3 py-2 text-right">{r.uu}</td>
                <td className="px-3 py-2 text-right">{r.trafficMB}</td>
                <td className="px-3 py-2 text-right">{r.costJpy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
