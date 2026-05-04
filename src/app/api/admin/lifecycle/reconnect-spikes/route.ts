import { NextResponse } from "next/server";

import {
  getLifecycleSupabase,
  lifecycleEventFromLog,
  parseLifecycleService,
  sourceMatchesService,
} from "@/lib/admin-lifecycle";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

type LogRow = {
  id: string;
  source: string;
  level: string;
  message: string;
  context: unknown;
  occurred_at: string;
};

const EVENT = "socket.reconnect.in_grace";
const BIN_MS = 5 * 60_000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function shortLog(row: LogRow) {
  return {
    id: row.id,
    source: row.source,
    level: row.level,
    message: row.message,
    context: row.context,
    occurred_at: row.occurred_at,
  };
}

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-lifecycle-reconnect-spikes" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = parseLifecycleService(url.searchParams.get("service"));
    if (!service) return NextResponse.json({ error: "invalid 'service'" }, { status: 400 });

    const supabase = getLifecycleSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "supabase service role not configured" }, { status: 500 });
    }

    const now = Date.now();
    const from = new Date(now - 24 * 3600_000).toISOString();
    const { data, error } = await supabase
      .from("service_logs")
      .select("id, source, level, message, context, occurred_at")
      .gte("occurred_at", from)
      .order("occurred_at", { ascending: true })
      .limit(10_000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const logs = ((data ?? []) as LogRow[]).filter(
      (row) =>
        sourceMatchesService(row.source, service) &&
        lifecycleEventFromLog(row.message, row.context) === EVENT,
    );

    const startBucket = Math.floor((now - 24 * 3600_000) / BIN_MS) * BIN_MS;
    const endBucket = Math.floor(now / BIN_MS) * BIN_MS;
    const buckets = new Map<number, LogRow[]>();
    for (let bucket = startBucket; bucket <= endBucket; bucket += BIN_MS) {
      buckets.set(bucket, []);
    }
    for (const log of logs) {
      const ts = Date.parse(log.occurred_at);
      if (!Number.isFinite(ts)) continue;
      const bucket = Math.floor(ts / BIN_MS) * BIN_MS;
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), log]);
    }

    const counts = Array.from(buckets.values()).map((rows) => rows.length);
    const med = median(counts);
    const sigma = stddev(counts);
    const threshold = med + 3 * sigma;
    const rows = Array.from(buckets.entries()).map(([bucket, bucketLogs]) => ({
      bucket,
      count: bucketLogs.length,
      threshold,
      spike: bucketLogs.length > 0 && bucketLogs.length > threshold,
    }));
    const spikeLogs = rows
      .filter((row) => row.spike)
      .map((row) => ({
        bucket: row.bucket,
        count: row.count,
        logs: (buckets.get(row.bucket) ?? []).slice(0, 50).map(shortLog),
      }));

    return NextResponse.json({
      service,
      event: EVENT,
      from,
      rows,
      spikeLogs,
      median: med,
      sigma,
      threshold,
      total: logs.length,
    });
  }),
);
