const JST_TIME_ZONE = "Asia/Tokyo";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type JstDateParts = {
  y: number;
  m: number;
  d: number;
};

export function toJstDateParts(date: Date): JstDateParts {
  const parts = jstDateFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return { y: year, m: month, d: day };
}

export function toJstDateKey(date: Date): string {
  const { y, m, d } = toJstDateParts(date);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function toJstMonthString(date: Date): string {
  const { y, m } = toJstDateParts(date);
  return `${y}-${pad2(m)}`;
}

export function getJstMonthBoundary(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET_MS);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
