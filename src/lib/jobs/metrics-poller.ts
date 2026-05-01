import { createClient } from "@supabase/supabase-js";
import type { CronJob, JobResult } from "@/lib/scheduler/types";

/**
 * metrics-poller: rezona / boundary の internal metrics endpoint を polling し、
 * service_metrics に時系列スナップショットとして保存する。
 */

type Target = {
  service: string;
  url: string;
  secret: string;
  secretHeaderName: string;
};

type MetricType = "server" | "rooms" | "users";
type MetricKind = "process" | "rooms" | "users";
type JsonObject = Record<string, unknown>;

type ServiceMetricRow = {
  service: string;
  server_id: string | null;
  kind: MetricKind;
  data: JsonObject;
};

const METRIC_TYPES: MetricType[] = ["server", "rooms", "users"];

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function asRecord(value: unknown): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function buildTargets(): { targets: Target[]; skipped: number } {
  const targets: Target[] = [];
  let skipped = 0;

  const rezonaUrl = process.env.REZONA_INTERNAL_URL?.trim();
  const rezonaSecret = process.env.REZONA_INTERNAL_SECRET?.trim();
  if (rezonaUrl && rezonaSecret) {
    targets.push({
      service: "rezona-server",
      url: normalizeBaseUrl(rezonaUrl),
      secret: rezonaSecret,
      secretHeaderName: "x-rezona-internal-secret",
    });
  } else {
    skipped += 1;
    console.warn(
      "[metrics-poller] REZONA_INTERNAL_URL / REZONA_INTERNAL_SECRET missing; skipping rezona-server",
    );
  }

  const boundaryUrl = normalizeBaseUrl(
    process.env.BOUNDARY_INTERNAL_URL?.trim() || "http://server:4000",
  );
  const boundarySecret = process.env.BOUNDARY_INTERNAL_SECRET?.trim();
  if (boundarySecret) {
    targets.push({
      service: "boundary-server",
      url: boundaryUrl,
      secret: boundarySecret,
      secretHeaderName: "x-boundary-internal-secret",
    });
  } else {
    skipped += 1;
    console.warn(
      "[metrics-poller] BOUNDARY_INTERNAL_SECRET missing; skipping boundary-server",
    );
  }

  return { targets, skipped };
}

function metricKind(type: MetricType): MetricKind {
  if (type === "server") return "process";
  return type;
}

function extractServerId(payload: JsonObject): string | null {
  const serverId = payload.server_id;
  return typeof serverId === "string" && serverId.length > 0 ? serverId : null;
}

function extractNestedMetric(payload: JsonObject, key: "rooms" | "users"): JsonObject | null {
  const data = asRecord(payload.data);
  return asRecord(data?.[key]) ?? asRecord(payload[key]);
}

function normalizeServerMetric(payload: JsonObject): JsonObject | null {
  const data = asRecord(payload.data);
  const server = asRecord(data?.server) ?? asRecord(payload.server);
  if (!server) return null;

  const normalized: JsonObject = { ...server };
  const samples = Array.isArray(server.samples) ? server.samples : [];
  const latestSample = samples.length > 0 ? samples[samples.length - 1] : undefined;

  if (Array.isArray(server.samples)) {
    normalized.samples = latestSample === undefined ? [] : [latestSample];
  }
  if ((normalized.current === undefined || normalized.current === null) && latestSample !== undefined) {
    normalized.current = latestSample;
  }

  return normalized;
}

function normalizeMetricPayload(type: MetricType, payload: JsonObject): JsonObject | null {
  if (type === "server") return normalizeServerMetric(payload);
  return extractNestedMetric(payload, type);
}

async function fetchMetricRow(
  target: Target,
  type: MetricType,
): Promise<ServiceMetricRow | null> {
  const upstreamUrl = `${target.url}/api/admin/metrics?type=${type}`;

  let response: Response;
  try {
    response = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        [target.secretHeaderName]: target.secret,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[metrics-poller] ${target.service} type=${type} fetch failed: ${message}`);
    return null;
  }

  if (!response.ok) {
    console.warn(
      `[metrics-poller] ${target.service} type=${type} returned HTTP ${response.status}`,
    );
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[metrics-poller] ${target.service} type=${type} JSON parse failed: ${message}`);
    return null;
  }

  const payload = asRecord(body);
  if (!payload) {
    console.warn(`[metrics-poller] ${target.service} type=${type} response is not an object`);
    return null;
  }

  const metricData = normalizeMetricPayload(type, payload);
  if (!metricData) {
    console.warn(`[metrics-poller] ${target.service} type=${type} payload missing metric data`);
    return null;
  }

  return {
    service: target.service,
    server_id: extractServerId(payload),
    kind: metricKind(type),
    data: metricData,
  };
}

export const metricsPollerJob: CronJob = {
  kind: "cron",
  name: "metrics-poller",
  description: "60s 間隔で rezona / boundary metrics endpoint を polling し service_metrics に保存",
  schedule: { type: "every", intervalMs: 60_000 },
  handler: async (): Promise<JobResult> => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { targets, skipped } = buildTargets();
    const rows: ServiceMetricRow[] = [];
    for (const target of targets) {
      for (const type of METRIC_TYPES) {
        const row = await fetchMetricRow(target, type);
        if (row) rows.push(row);
      }
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error } = await supabase.from("service_metrics").insert(rows);
      if (error) {
        console.warn(`[metrics-poller] insert failed: ${error.message}`);
      } else {
        inserted = rows.length;
      }
    }

    return {
      ok: true,
      message: `polled ${targets.length} targets, wrote ${inserted} rows`,
      meta: {
        targets: targets.map((target) => target.service),
        inserted,
        skipped,
      },
    };
  },
};
