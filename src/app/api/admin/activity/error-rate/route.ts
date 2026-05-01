import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

type Service = "boundary" | "rezona";
type Period = "1h" | "24h" | "7d" | "30d";

type ActivityApiRequestRow = {
  action: string;
  metadata: Record<string, unknown> | null;
};

type RouteStats = {
  route: string;
  total: number;
  error5xx: number;
};

const ALL_SERVICES: Service[] = ["boundary", "rezona"];
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parsePeriod(url: URL): { label: Period; sinceIso: string } {
  const raw = url.searchParams.get("period");
  const label: Period =
    raw === "1h" || raw === "24h" || raw === "7d" || raw === "30d" ? raw : "24h";

  const hours =
    label === "1h" ? 1 : label === "7d" ? 7 * 24 : label === "30d" ? 30 * 24 : 24;

  return {
    label,
    sinceIso: new Date(Date.now() - hours * 3600_000).toISOString(),
  };
}

function parseServices(url: URL): Service[] {
  const raw = url.searchParams.get("service");
  if (!raw) return ALL_SERVICES;

  const services = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Service => s === "boundary" || s === "rezona");

  return services.length > 0 ? services : ALL_SERVICES;
}

function parseLimit(url: URL): number {
  const raw = Number(url.searchParams.get("limit") ?? "50");
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.min(100, Math.max(1, Math.floor(raw)));
}

function routeFromAction(action: string): string {
  const parts = action.split(" ").filter(Boolean);
  const route = parts.length > 1 ? parts.slice(1).join(" ") : action;
  return route || action;
}

function statusFromMetadata(metadata: Record<string, unknown> | null): number | null {
  const status = metadata?.status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

export const GET = withRateLimit(
  { max: 15, windowMs: 60_000, scope: "admin-activity-error-rate" },
  withOwnerOrGuest(async (request) => {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 },
      );
    }

    const url = new URL(request.url);
    const groupBy = url.searchParams.get("group_by") ?? "route";
    if (groupBy !== "route") {
      return NextResponse.json({ error: "group_by must be route" }, { status: 400 });
    }

    const period = parsePeriod(url);
    const services = parseServices(url);
    const limit = parseLimit(url);

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("activity_events")
      .select("action, metadata")
      .eq("event_type", "api_request")
      .gte("occurred_at", period.sinceIso)
      .in("service", services)
      .order("occurred_at", { ascending: false })
      .range(0, 9999);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as ActivityApiRequestRow[];
    const byRoute = new Map<string, RouteStats>();
    let totalRequests = 0;
    let total5xx = 0;

    for (const row of rows) {
      const route = routeFromAction(row.action);
      const status = statusFromMetadata(row.metadata);
      const current = byRoute.get(route) ?? { route, total: 0, error5xx: 0 };
      const is5xx = status !== null && status >= 500 && status < 600;

      current.total += 1;
      if (is5xx) {
        current.error5xx += 1;
        total5xx += 1;
      }

      totalRequests += 1;
      byRoute.set(route, current);
    }

    const routes = Array.from(byRoute.values())
      .filter((r) => r.error5xx >= 1)
      .sort((a, b) => b.error5xx - a.error5xx || b.total - a.total)
      .slice(0, limit)
      .map((r) => ({
        ...r,
        rate: Number((r.error5xx / r.total).toFixed(4)),
      }));

    return NextResponse.json({
      period: period.label,
      service: services,
      total_requests: totalRequests,
      total_5xx: total5xx,
      routes,
    });
  }),
);
