import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

type MetricKind = "process" | "rooms" | "users";
type MetricPeriod = "1h" | "24h" | "7d" | "30d";

const SERVICE_RE = /^[a-zA-Z0-9_:.-]+$/;
const ALLOWED_KINDS = new Set<MetricKind>(["process", "rooms", "users"]);
const ALLOWED_PERIODS = new Set<MetricPeriod>(["1h", "24h", "7d", "30d"]);

const PERIOD_MS: Record<MetricPeriod, number> = {
  "1h": 3600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

function isMetricKind(value: string | null): value is MetricKind {
  return value !== null && ALLOWED_KINDS.has(value as MetricKind);
}

function isMetricPeriod(value: string): value is MetricPeriod {
  return ALLOWED_PERIODS.has(value as MetricPeriod);
}

function parseIsoParam(value: string | null, name: string): string | null | NextResponse {
  if (!value) return null;
  if (Number.isNaN(Date.parse(value))) {
    return NextResponse.json(
      { error: `invalid '${name}' (must be ISO 8601)` },
      { status: 400 },
    );
  }
  return value;
}

function parseLimit(value: string | null): number | NextResponse {
  if (value === null) return 1000;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    return NextResponse.json(
      { error: "invalid 'limit' (must be integer between 1 and 10000)" },
      { status: 400 },
    );
  }
  return limit;
}

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-metrics-history" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = url.searchParams.get("service");
    const kind = url.searchParams.get("kind");
    const periodRaw = url.searchParams.get("period") ?? "24h";

    if (!service) {
      return NextResponse.json({ error: "missing 'service'" }, { status: 400 });
    }
    if (!SERVICE_RE.test(service) || service.length > 80) {
      return NextResponse.json({ error: "invalid 'service'" }, { status: 400 });
    }
    if (!isMetricKind(kind)) {
      return NextResponse.json(
        { error: "invalid 'kind' (must be process | rooms | users)" },
        { status: 400 },
      );
    }
    if (!isMetricPeriod(periodRaw)) {
      return NextResponse.json(
        { error: "invalid 'period' (must be 1h | 24h | 7d | 30d)" },
        { status: 400 },
      );
    }

    const parsedFrom = parseIsoParam(url.searchParams.get("from"), "from");
    if (parsedFrom instanceof NextResponse) return parsedFrom;
    const parsedTo = parseIsoParam(url.searchParams.get("to"), "to");
    if (parsedTo instanceof NextResponse) return parsedTo;
    const parsedLimit = parseLimit(url.searchParams.get("limit"));
    if (parsedLimit instanceof NextResponse) return parsedLimit;

    const from = parsedFrom ?? new Date(Date.now() - PERIOD_MS[periodRaw]).toISOString();
    const to = parsedTo;

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !key) {
      return NextResponse.json(
        { error: "supabase service role not configured" },
        { status: 500 },
      );
    }
    const supabase = createClient(supabaseUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let q = supabase
      .from("service_metrics")
      .select("id, service, server_id, kind, captured_at, data")
      .eq("service", service)
      .eq("kind", kind)
      .order("captured_at", { ascending: true })
      .limit(parsedLimit);

    if (from) q = q.gte("captured_at", from);
    if (to) q = q.lte("captured_at", to);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    return NextResponse.json({
      rows,
      service,
      kind,
      period: periodRaw,
      from,
      to,
      count: rows.length,
    });
  }),
);
