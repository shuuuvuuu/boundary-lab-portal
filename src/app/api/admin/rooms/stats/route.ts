import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyDiscord } from "@/lib/alerts/discord";
import { withTier } from "@/lib/auth/with-tier";
import { isReticulumDbConfigured, lookupHubNames } from "@/lib/hubs/db";
import { getJstMonthBoundary, toJstDateKey } from "@/lib/time/jst";
import type { AdminRoomStatsResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type RoomEntryEventRow = {
  id: number;
  hub_id: string;
  session_id: string;
  hubs_account_id: string | null;
  anon_id: string | null;
  entered_at: string;
  left_at: string | null;
};

type RoomAccumulator = {
  hubId: string;
  activeDays: Set<string>;
  sessionIds: Set<string>;
  visitorKeys: Set<string>;
  totalStaySeconds: number;
  closedSessions: number;
  // left_at が null の在室中セッションも現時点までの滞在時間に含める。
  ongoingSessionsCountedUntilNow: number;
};

type MonthBounds = {
  month: string;
  start: Date;
  endExclusive: Date;
  endOfMonth: Date;
};

export const GET = withTier("enterprise", async (request, { supabase, user }) => {
  const month = request.nextUrl.searchParams.get("month");
  const bounds = parseMonth(month);

  if (!bounds) {
    return NextResponse.json({ error: "invalid month" }, { status: 400 });
  }

  try {
    const generatedAt = new Date();
    const events = await listMonthlyEvents(
      supabase,
      bounds.start.toISOString(),
      bounds.endExclusive.toISOString(),
    );
    const hubIds = [...new Set(events.map((event) => event.hub_id))];

    let roomNames: Record<string, string> = {};

    if (hubIds.length > 0 && isReticulumDbConfigured()) {
      try {
        roomNames = await lookupHubNames(hubIds);
      } catch (err) {
        const error = err as { code?: string; message?: string };
        void notifyDiscord("warn", "Reticulum hub name lookup failed", {
          code: error.code ?? "unknown",
          user_id: user.id,
        });
      }
    }

    const { rows, ongoingSessions } = aggregateByRoom(events, roomNames, bounds, generatedAt);
    const response: AdminRoomStatsResponse = {
      month: bounds.month,
      generatedAt: generatedAt.toISOString(),
      ongoingSessions,
      roomNameResolvedCount: rows.filter((row) => row.roomName !== null).length,
      roomCount: rows.length,
      rows,
    };

    return NextResponse.json(response);
  } catch (err) {
    const error = err as { code?: string; message?: string };
    void notifyDiscord("error", "Admin room stats query failed", {
      code: error.code ?? "unknown",
      user_id: user.id,
      month: bounds.month,
    });
    return NextResponse.json({ error: "failed to load room stats" }, { status: 502 });
  }
});

function parseMonth(value: string | null): MonthBounds | null {
  if (!value || !MONTH_RE.test(value)) return null;

  const [yearRaw, monthRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const start = getJstMonthBoundary(year, month);
  const endExclusive = getJstMonthBoundary(year, month + 1);
  const endOfMonth = new Date(endExclusive.getTime() - 1000);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(endExclusive.getTime()) ||
    Number.isNaN(endOfMonth.getTime())
  ) {
    return null;
  }

  return { month: value, start, endExclusive, endOfMonth };
}

async function listMonthlyEvents(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string,
): Promise<RoomEntryEventRow[]> {
  const events: RoomEntryEventRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("room_entry_events")
      .select("id,hub_id,session_id,hubs_account_id,anon_id,entered_at,left_at")
      .lt("entered_at", endIso)
      .or(`left_at.is.null,left_at.gte.${startIso}`)
      .order("entered_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as RoomEntryEventRow[];
    events.push(...page);

    if (page.length < PAGE_SIZE) {
      return events;
    }
  }
}

function aggregateByRoom(
  events: RoomEntryEventRow[],
  roomNames: Record<string, string>,
  bounds: MonthBounds,
  now: Date,
): Pick<AdminRoomStatsResponse, "rows" | "ongoingSessions"> {
  const perRoom = new Map<string, RoomAccumulator>();
  const countedUntil = now.getTime() < bounds.endOfMonth.getTime() ? now : bounds.endOfMonth;
  let ongoingSessions = 0;

  for (const event of events) {
    const existing = perRoom.get(event.hub_id);
    const current =
      existing ??
      {
        hubId: event.hub_id,
        activeDays: new Set<string>(),
        sessionIds: new Set<string>(),
        visitorKeys: new Set<string>(),
        totalStaySeconds: 0,
        closedSessions: 0,
        ongoingSessionsCountedUntilNow: 0,
      };

    const enteredAt = new Date(event.entered_at);
    const effectiveEnteredAt =
      enteredAt.getTime() > bounds.start.getTime() ? enteredAt : bounds.start;
    current.sessionIds.add(event.session_id);
    current.visitorKeys.add(getVisitorKey(event));

    if (event.left_at) {
      current.closedSessions += 1;
    } else {
      current.ongoingSessionsCountedUntilNow += 1;
      ongoingSessions += 1;
    }

    const rawLeftAt = event.left_at ? new Date(event.left_at) : null;
    const effectiveLeftAt =
      rawLeftAt && rawLeftAt.getTime() < countedUntil.getTime() ? rawLeftAt : countedUntil;
    addActiveDays(current.activeDays, effectiveEnteredAt, effectiveLeftAt, bounds);
    const durationSeconds = Math.max(
      0,
      Math.floor((effectiveLeftAt.getTime() - effectiveEnteredAt.getTime()) / 1000),
    );
    current.totalStaySeconds += durationSeconds;

    perRoom.set(event.hub_id, current);
  }

  const rows = [...perRoom.values()]
    .map((room) => {
      const stayDurationSamples = room.closedSessions + room.ongoingSessionsCountedUntilNow;

      return {
        hubId: room.hubId,
        roomName: roomNames[room.hubId] ?? null,
        activeDays: room.activeDays.size,
        entryCount: room.sessionIds.size,
        uniqueVisitors: room.visitorKeys.size,
        totalStaySeconds: room.totalStaySeconds,
        averageStaySeconds:
          stayDurationSamples > 0
            ? Math.round(room.totalStaySeconds / stayDurationSamples)
            : null,
        peakConcurrent: null,
        trafficMB: null,
        costJpy: null,
      };
    })
    .sort(
      (left, right) =>
        right.totalStaySeconds - left.totalStaySeconds ||
        right.entryCount - left.entryCount ||
        left.hubId.localeCompare(right.hubId),
    );

  return { rows, ongoingSessions };
}

function getVisitorKey(event: RoomEntryEventRow): string {
  if (event.hubs_account_id) return `hubs:${event.hubs_account_id}`;
  if (event.anon_id) return `anon:${event.anon_id}`;
  return `session:${event.session_id}`;
}

function addActiveDays(
  activeDays: Set<string>,
  start: Date,
  end: Date,
  bounds: MonthBounds,
): void {
  if (end.getTime() <= start.getTime()) {
    return;
  }

  for (
    let dayStart = bounds.start.getTime();
    dayStart < bounds.endExclusive.getTime();
    dayStart += DAY_MS
  ) {
    const dayEnd = dayStart + DAY_MS;

    if (start.getTime() < dayEnd && end.getTime() > dayStart) {
      activeDays.add(toJstDateKey(new Date(dayStart)));
    }
  }
}
