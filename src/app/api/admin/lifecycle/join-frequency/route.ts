import { NextResponse } from "next/server";

import {
  activityServiceFilter,
  asRecord,
  getLifecycleSupabase,
  parseLifecycleService,
  stringField,
} from "@/lib/admin-lifecycle";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

type ActivityRow = {
  id: string;
  service: string;
  user_id: string | null;
  metadata: unknown;
  occurred_at: string;
};

function thresholdFrom(url: URL): number {
  const raw = Number(url.searchParams.get("threshold") ?? "5");
  if (!Number.isFinite(raw)) return 5;
  return Math.max(1, Math.min(50, Math.floor(raw)));
}

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-lifecycle-join-frequency" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = parseLifecycleService(url.searchParams.get("service"));
    if (!service) return NextResponse.json({ error: "invalid 'service'" }, { status: 400 });
    const threshold = thresholdFrom(url);

    const supabase = getLifecycleSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "supabase service role not configured" }, { status: 500 });
    }

    const from = new Date(Date.now() - 3600_000).toISOString();
    let q = supabase
      .from("activity_events")
      .select("id, service, user_id, metadata, occurred_at")
      .eq("event_type", "user_action")
      .eq("action", "room_join")
      .gte("occurred_at", from)
      .order("occurred_at", { ascending: false })
      .limit(10_000);

    const services = activityServiceFilter(service);
    if (services) q = q.in("service", services);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const counts = new Map<
      string,
      {
        user_id: string;
        count: number;
        services: Set<string>;
        rooms: Set<string>;
        last_join_at: string;
      }
    >();
    for (const row of (data ?? []) as ActivityRow[]) {
      if (!row.user_id) continue;
      const current = counts.get(row.user_id) ?? {
        user_id: row.user_id,
        count: 0,
        services: new Set<string>(),
        rooms: new Set<string>(),
        last_join_at: row.occurred_at,
      };
      const meta = asRecord(row.metadata);
      const room = stringField(meta, ["room_id", "world_id", "room"]);
      current.count += 1;
      current.services.add(row.service);
      if (room) current.rooms.add(room);
      if (Date.parse(row.occurred_at) > Date.parse(current.last_join_at)) {
        current.last_join_at = row.occurred_at;
      }
      counts.set(row.user_id, current);
    }

    const rows = Array.from(counts.values())
      .filter((row) => row.count >= threshold)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((row) => ({
        user_id: row.user_id,
        count: row.count,
        services: Array.from(row.services).sort(),
        rooms: Array.from(row.rooms).sort().slice(0, 5),
        last_join_at: row.last_join_at,
      }));

    return NextResponse.json({
      service,
      threshold,
      from,
      rows,
      totalUsers: counts.size,
      totalJoins: ((data ?? []) as ActivityRow[]).length,
    });
  }),
);
