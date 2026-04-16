import { NextResponse } from "next/server";
import { withTier } from "@/lib/auth/with-tier";
import { toJstMonthString } from "@/lib/time/jst";
import type { AdminRoomMonthsResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

const DEFAULT_START_MONTH = "2026-04";

type MonthRow = {
  entered_at: string;
};

export const GET = withTier("enterprise", async (_request, { supabase }) => {
  const { data, error } = await supabase
    .from("room_entry_events")
    .select("entered_at")
    .order("entered_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "failed to load room months" }, { status: 502 });
  }

  const firstRow = (data as MonthRow | null) ?? null;
  const firstMonth = firstRow ? toJstMonthString(new Date(firstRow.entered_at)) : null;
  const startMonth =
    firstMonth && firstMonth < DEFAULT_START_MONTH ? firstMonth : DEFAULT_START_MONTH;

  const response: AdminRoomMonthsResponse = {
    months: generateMonthRange(startMonth, toJstMonthString(new Date())),
  };

  return NextResponse.json(response);
});

function generateMonthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const cursor = parseMonth(startMonth);
  const end = parseMonth(endMonth);

  if (!cursor || !end) {
    return [DEFAULT_START_MONTH];
  }

  while (
    cursor.year < end.year ||
    (cursor.year === end.year && cursor.month <= end.month)
  ) {
    months.push(formatMonth(cursor.year, cursor.month));
    cursor.month += 1;

    if (cursor.month === 13) {
      cursor.year += 1;
      cursor.month = 1;
    }
  }

  return months;
}

function parseMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
