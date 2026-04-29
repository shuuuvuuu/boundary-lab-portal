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
  { value: "all", label: "全期間", title: "全期間 (Sentry: 90d / Supabase: 制限なし)" },
];

/**
 * /admin/ops 全 8 タブで共有する期間セレクタ。
 * 既存の他セレクタ (Issues タブの category / Logs タブの level 等) と
 * 並列に header 内へ配置することを想定。
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

/**
 * Sentry API に渡す statsPeriod 値に変換する。
 * `7h` も Sentry が解釈できる (`<num><unit>` 形式)。`all` は 90d とする。
 */
export function toSentryStatsPeriod(range: TimeRange): string {
  if (range === "1h") return "1h";
  if (range === "7h") return "7h";
  if (range === "24h") return "24h";
  return "90d";
}
