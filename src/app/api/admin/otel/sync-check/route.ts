import { NextResponse } from "next/server";

import {
  boundedInt,
  getSupabaseAdmin,
  parseAdminOtelPeriod,
} from "@/lib/admin-otel";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

type JsonObject = Record<string, unknown>;
type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type OtelLogRow = {
  id: string;
  observed_timestamp: string;
  timestamp: string | null;
  trace_id: string | null;
  span_id: string | null;
  severity_text: string | null;
  service_name: string;
  body: string | null;
  resource_attributes: unknown;
  log_attributes: unknown;
};

type ServiceLogRow = {
  id: string;
  source: string;
  level: string;
  message: string;
  context: unknown;
  occurred_at: string;
};

type SyncEventName = (typeof SYNC_EVENTS)[number];

const SYNC_EVENTS = [
  "livekit.metrics.unreachable",
  "socket.assertion.fail",
  "socket.reconnect.in_grace",
  "auth.socket.fail",
  "livekit.webhook.in",
] as const;

const EVENT_SET = new Set<string>(SYNC_EVENTS);
const LIVEKIT_UNREACHABLE = "livekit.metrics.unreachable";
const SOCKET_ASSERTION_FAIL = "socket.assertion.fail";

function asRecord(value: unknown): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as JsonObject;
}

function stringAt(record: JsonObject | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return null;
}

function jsonObjectFromText(text: string | null): JsonObject | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function knownEventFromText(text: string | null): SyncEventName | null {
  if (!text) return null;
  return SYNC_EVENTS.find((event) => text.includes(event)) ?? null;
}

function knownEventFromValue(value: string | null): SyncEventName | null {
  if (!value) return null;
  if (EVENT_SET.has(value)) return value as SyncEventName;
  return knownEventFromText(value);
}

function eventFromOtel(row: OtelLogRow): SyncEventName | null {
  const attrs = asRecord(row.log_attributes);
  const direct = knownEventFromValue(
    stringAt(attrs, ["event", "event.name", "name", "message"]),
  );
  if (direct) return direct;

  const bodyObject = jsonObjectFromText(row.body);
  const bodyEvent = knownEventFromValue(
    stringAt(bodyObject, ["event", "event.name", "name", "message"]),
  );
  if (bodyEvent) return bodyEvent;

  return knownEventFromText(row.body);
}

function eventFromServiceLog(row: ServiceLogRow): SyncEventName | null {
  const context = asRecord(row.context);
  const direct = knownEventFromValue(
    stringAt(context, ["event", "event.name", "name", "message"]),
  );
  if (direct) return direct;

  return knownEventFromText(row.message);
}

function reasonFromOtel(row: OtelLogRow): string {
  const attrs = asRecord(row.log_attributes);
  const bodyObject = jsonObjectFromText(row.body);
  return (
    stringAt(attrs, ["reason", "error", "error.message", "message"]) ??
    stringAt(bodyObject, ["reason", "error", "error.message", "message"]) ??
    "(none)"
  );
}

function reasonFromServiceLog(row: ServiceLogRow): string {
  const context = asRecord(row.context);
  return stringAt(context, ["reason", "error", "error.message", "message"]) ?? "(none)";
}

function occurredAt(row: OtelLogRow): string {
  return row.timestamp ?? row.observed_timestamp;
}

async function fetchOtelRows(
  supabase: SupabaseAdmin,
  sinceIso: string | null,
  limit: number,
): Promise<OtelLogRow[]> {
  let q = supabase
    .from("otel_logs")
    .select(
      "id, observed_timestamp, timestamp, trace_id, span_id, severity_text, service_name, body, resource_attributes, log_attributes",
    )
    .order("observed_timestamp", { ascending: false })
    .limit(limit);

  if (sinceIso !== null) q = q.gte("observed_timestamp", sinceIso);

  const { data, error } = await q;
  if (error) throw new Error(`otel_logs: ${error.message}`);
  return ((data ?? []) as OtelLogRow[]).filter((row) => eventFromOtel(row) !== null);
}

async function fetchServiceRows(
  supabase: SupabaseAdmin,
  sinceIso: string | null,
  limit: number,
): Promise<ServiceLogRow[]> {
  let q = supabase
    .from("service_logs")
    .select("id, source, level, message, context, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (sinceIso !== null) q = q.gte("occurred_at", sinceIso);

  const { data, error } = await q;
  if (error) throw new Error(`service_logs: ${error.message}`);
  return ((data ?? []) as ServiceLogRow[]).filter((row) => eventFromServiceLog(row) !== null);
}

function toTimelineEvent(row: OtelLogRow | ServiceLogRow) {
  if ("service_name" in row) {
    const event = eventFromOtel(row);
    if (!event) return null;
    return {
      id: row.id,
      source: "otel" as const,
      event,
      occurred_at: occurredAt(row),
      service: row.service_name,
      level: row.severity_text,
      message: row.body,
      trace_id: row.trace_id,
      span_id: row.span_id,
      context: {
        resource_attributes: row.resource_attributes,
        log_attributes: row.log_attributes,
      },
    };
  }

  const event = eventFromServiceLog(row);
  if (!event) return null;
  return {
    id: row.id,
    source: "service_logs" as const,
    event,
    occurred_at: row.occurred_at,
    service: row.source,
    level: row.level,
    message: row.message,
    trace_id: null,
    span_id: null,
    context: row.context,
  };
}

function sortDescByTime<T extends { occurred_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
}

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-otel-sync-check" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const period = parseAdminOtelPeriod(url.searchParams.get("period"));
    const limit = boundedInt(url.searchParams.get("limit"), 10_000, 1, 10_000);
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "supabase service role not configured" },
        { status: 500 },
      );
    }

    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

    try {
      const [otelRows, serviceRows, otel24hRows, service24hRows] = await Promise.all([
        fetchOtelRows(supabase, period.sinceIso, limit),
        fetchServiceRows(supabase, period.sinceIso, limit),
        fetchOtelRows(supabase, since24h, limit),
        fetchServiceRows(supabase, since24h, limit),
      ]);

      const timelineEvents = sortDescByTime(
        [...otelRows, ...serviceRows]
          .map(toTimelineEvent)
          .filter((row): row is NonNullable<ReturnType<typeof toTimelineEvent>> => row !== null),
      );

      const assertionFailures = timelineEvents
        .filter((row) => row.event === SOCKET_ASSERTION_FAIL)
        .slice(0, 50);

      const livekitRows = [...otel24hRows, ...service24hRows].flatMap((row) => {
        const event = "service_name" in row ? eventFromOtel(row) : eventFromServiceLog(row);
        if (event !== LIVEKIT_UNREACHABLE) return [];
        return [{
          occurred_at: "service_name" in row ? occurredAt(row) : row.occurred_at,
          reason: "service_name" in row ? reasonFromOtel(row) : reasonFromServiceLog(row),
        }];
      });

      const oneHourAgo = Date.now() - 3600_000;
      const last1h = livekitRows.filter(
        (row) => Date.parse(row.occurred_at) >= oneHourAgo,
      ).length;
      const reasonCounts = livekitRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.reason] = (acc[row.reason] ?? 0) + 1;
        return acc;
      }, {});

      return NextResponse.json({
        period: period.period,
        timelineEvents,
        assertionFailures,
        livekit: {
          total24h: livekitRows.length,
          last1h,
          list_rooms_failed: reasonCounts.list_rooms_failed ?? 0,
          user_metrics_list_rooms_failed: reasonCounts.user_metrics_list_rooms_failed ?? 0,
          reasonCounts,
          status: last1h === 0 ? "ok" : last1h < 10 ? "warning" : "critical",
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "unknown error" },
        { status: 500 },
      );
    }
  }),
);
