"use client";

export type TimeRange = "1h" | "7h" | "24h" | "all";

export const TIME_RANGE_OPTIONS: ReadonlyArray<{
  value: TimeRange;
  label: string;
  title: string;
}> = [
  { value: "1h", label: "1h", title: "直近 1 時間" },
  { value: "7h", label: "7h", title: "直近 7 時間" },
  { value: "24h", label: "24h", title: "直近 24 時間 (デフォルト)" },
  { value: "all", label: "全期間", title: "全期間" },
];

/**
 * /admin/ops の各タブで共有する期間セレクタ。
 */
export function TimeRangeSelector({
  value,
  onChange,
  className,
}: {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs ${className ?? ""}`}
      role="group"
      aria-label="期間"
    >
      {TIME_RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          title={opt.title}
          className={`rounded px-2 py-1 transition ${
            value === opt.value
              ? "bg-slate-700 text-slate-100"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
