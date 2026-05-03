import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

type DeployEventRow = {
  id: string;
  service: string;
  server_id: string;
  release: string | null;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
};

type DeployEventResponseRow = DeployEventRow & {
  duration_seconds: number;
};

const SERVICE_RE = /^[a-zA-Z0-9_:.-]+$/;

function parseLimit(value: string | null): number | NextResponse {
  if (value === null) return 50;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return NextResponse.json(
      { error: "invalid 'limit' (must be integer between 1 and 500)" },
      { status: 400 },
    );
  }
  return limit;
}

function parseOffset(value: string | null): number | NextResponse {
  if (value === null) return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "invalid 'offset' (must be integer >= 0)" }, { status: 400 });
  }
  return offset;
}

function durationSeconds(firstSeenAt: string, lastSeenAt: string): number {
  const first = Date.parse(firstSeenAt);
  const last = Date.parse(lastSeenAt);
  if (Number.isNaN(first) || Number.isNaN(last)) return 0;
  return Math.max(0, Math.floor((last - first) / 1000));
}

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-deploy-events" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = url.searchParams.get("service") ?? "rezona-server";
    const parsedLimit = parseLimit(url.searchParams.get("limit"));
    if (parsedLimit instanceof NextResponse) return parsedLimit;
    const parsedOffset = parseOffset(url.searchParams.get("offset"));
    if (parsedOffset instanceof NextResponse) return parsedOffset;

    if (!SERVICE_RE.test(service) || service.length > 80) {
      return NextResponse.json({ error: "invalid 'service'" }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !key) {
      return NextResponse.json({ error: "supabase service role not configured" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from("deploy_events")
      .select("id, service, server_id, release, first_seen_at, last_seen_at, event_count")
      .eq("service", service)
      .order("first_seen_at", { ascending: false })
      .range(parsedOffset, parsedOffset + parsedLimit - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events: DeployEventResponseRow[] = ((data ?? []) as DeployEventRow[]).map((row) => ({
      ...row,
      duration_seconds: durationSeconds(row.first_seen_at, row.last_seen_at),
    }));

    return NextResponse.json({
      events,
      service,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }),
);
