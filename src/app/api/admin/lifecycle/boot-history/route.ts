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
  action: "server_boot" | "server_stop_graceful";
  metadata: unknown;
  occurred_at: string;
};

type PairStatus = "normal" | "abnormal" | "running";

function serverId(row: ActivityRow): string {
  const meta = asRecord(row.metadata);
  return stringField(meta, ["server_id", "service_id", "hostname", "pid"]) ?? "unknown";
}

function releaseOf(row: ActivityRow): string | null {
  const meta = asRecord(row.metadata);
  return stringField(meta, ["release", "git_sha", "version"]);
}

function buildPairs(rows: ActivityRow[]) {
  const now = Date.now();
  const groups = new Map<string, ActivityRow[]>();
  for (const row of rows) {
    const key = `${row.service}:${serverId(row)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.values())
    .flatMap((events) =>
      events.flatMap((event, index) => {
        if (event.action !== "server_boot") return [];
        const next = events.slice(index + 1).find((row) => row.action !== undefined);
        let status: PairStatus = "running";
        let pairedAt: string | null = null;
        let elapsedTo = now;

        if (next?.action === "server_stop_graceful") {
          status = "normal";
          pairedAt = next.occurred_at;
          elapsedTo = Date.parse(next.occurred_at);
        } else if (next?.action === "server_boot") {
          status = "abnormal";
          pairedAt = next.occurred_at;
          elapsedTo = Date.parse(next.occurred_at);
        }

        return [
          {
            id: event.id,
            service: event.service,
            timestamp: event.occurred_at,
            server_id: serverId(event),
            release: releaseOf(event),
            event: event.action,
            paired_at: pairedAt,
            elapsed_ms: Math.max(0, elapsedTo - Date.parse(event.occurred_at)),
            pair_status: status,
          },
        ];
      }),
    )
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-lifecycle-boot-history" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = parseLifecycleService(url.searchParams.get("service"));
    if (!service) return NextResponse.json({ error: "invalid 'service'" }, { status: 400 });

    const supabase = getLifecycleSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "supabase service role not configured" }, { status: 500 });
    }

    const from = new Date(Date.now() - 24 * 3600_000).toISOString();
    let q = supabase
      .from("activity_events")
      .select("id, service, action, metadata, occurred_at")
      .eq("event_type", "server_event")
      .in("action", ["server_boot", "server_stop_graceful"])
      .gte("occurred_at", from)
      .order("occurred_at", { ascending: true })
      .limit(10_000);

    const services = activityServiceFilter(service);
    if (services) q = q.in("service", services);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const events = (data ?? []) as ActivityRow[];
    const rows = buildPairs(events);
    return NextResponse.json({
      service,
      from,
      rows,
      count: rows.length,
      events: events.length,
      note:
        service === "portal"
          ? "portal は activity_events に server_event を書き込んでいません。Phase 5+ 別 PR で portal 自身の boot 記録追加予定。boundary lifecycle を参照してください。"
          : null,
    });
  }),
);
