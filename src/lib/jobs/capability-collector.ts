import type { CronJob, JobResult } from "@/lib/scheduler/types";
import {
  getCapabilityIngestToken,
  getSupabaseCapabilityClient,
  type CapabilitySnapshot,
  type CapabilityState,
  upsertCapabilitySnapshot,
} from "@/lib/capability/store";

type JsonObject = Record<string, unknown>;

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function asRecord(value: unknown): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as JsonObject;
}

function boolField(record: JsonObject, key: string): boolean | null {
  return typeof record[key] === "boolean" ? record[key] : null;
}

function stringField(record: JsonObject, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractDiagPayload(body: unknown): JsonObject | null {
  const root = asRecord(body);
  if (!root) return null;
  return asRecord(root.data) ?? root;
}

function capabilityFromDiag(diag: JsonObject): Record<string, CapabilityState> {
  return {
    db: boolField(diag, "db_connected") === true ? "green" : "red",
    redis: boolField(diag, "redis_connected") === true ? "green" : "yellow",
    livekit: boolField(diag, "livekit_reachable") === true ? "green" : "red",
    otel: stringField(diag, "otel_endpoint") ? "green" : "yellow",
  };
}

function portalBaseUrl(): string | null {
  const raw =
    process.env.PORTAL_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return raw ? normalizeBaseUrl(raw) : null;
}

async function postCapabilitySnapshot(snapshot: CapabilitySnapshot): Promise<"api" | "direct"> {
  const token = getCapabilityIngestToken();
  const baseUrl = portalBaseUrl();
  if (!token || !baseUrl) {
    await upsertCapabilitySnapshot(snapshot);
    return "direct";
  }

  try {
    const response = await fetch(`${baseUrl}/api/admin/capability/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(snapshot),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return "api";
    console.warn(`[capability-collector] ingest endpoint returned HTTP ${response.status}`);
  } catch (err) {
    console.warn(
      "[capability-collector] ingest endpoint fetch failed:",
      err instanceof Error ? err.message : String(err),
    );
  }

  await upsertCapabilitySnapshot(snapshot);
  return "direct";
}

async function fetchRezonaSnapshot(): Promise<CapabilitySnapshot | null> {
  const url = process.env.REZONA_INTERNAL_URL?.trim();
  const secret = process.env.REZONA_INTERNAL_SECRET?.trim();
  if (!url || !secret) {
    console.debug("[capability-collector] rezona internal env missing; skip");
    return null;
  }

  const response = await fetch(`${normalizeBaseUrl(url)}/api/admin/diag`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${secret}`,
      "x-rezona-internal-secret": secret,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch((err: unknown) => {
    console.warn(
      "[capability-collector] rezona diag fetch failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  });

  if (!response) return null;
  if (response.status === 404) {
    console.debug("[capability-collector] rezona diag not found; skip");
    return null;
  }
  if (!response.ok) {
    console.warn(`[capability-collector] rezona diag returned HTTP ${response.status}`);
    return null;
  }

  const body = await response.json().catch(() => null);
  const diag = extractDiagPayload(body);
  if (!diag) {
    console.warn("[capability-collector] rezona diag payload is invalid");
    return null;
  }

  return {
    service: "rezona",
    last_seen_at: new Date().toISOString(),
    capabilities: capabilityFromDiag(diag),
  };
}

function hasOtelEndpoint(): boolean {
  return [
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    process.env.OTEL_ENDPOINT,
    process.env.NEXT_PUBLIC_OTEL_ENDPOINT,
    process.env.OTEL_INGEST_TOKEN,
  ].some((value) => Boolean(value?.trim()));
}

async function checkPortalDb(): Promise<boolean> {
  const supabase = getSupabaseCapabilityClient();
  if (!supabase) return false;
  const { error } = await supabase.from("job_runs").select("id").limit(1);
  return !error;
}

async function buildPortalCapabilitySnapshot(): Promise<CapabilitySnapshot> {
  const dbConnected = await checkPortalDb();
  return {
    service: "portal",
    last_seen_at: new Date().toISOString(),
    capabilities: {
      db: dbConnected ? "green" : "red",
      redis: "yellow",
      livekit: "gray",
      otel: hasOtelEndpoint() ? "green" : "yellow",
    },
  };
}

export async function ingestPortalCapabilitySnapshot(): Promise<CapabilitySnapshot> {
  const snapshot = await buildPortalCapabilitySnapshot();
  await upsertCapabilitySnapshot(snapshot);
  return snapshot;
}

export const capabilityCollectorJob: CronJob = {
  kind: "cron",
  name: "capability-collector",
  description: "60s 間隔で service capability snapshot を収集して保存",
  schedule: { type: "every", intervalMs: 60_000 },
  handler: async (): Promise<JobResult> => {
    const snapshots: CapabilitySnapshot[] = [];

    try {
      snapshots.push(await ingestPortalCapabilitySnapshot());
    } catch (err) {
      return {
        ok: false,
        message: `portal capability ingest failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    const rezona = await fetchRezonaSnapshot();
    if (rezona) snapshots.push(rezona);

    let apiPosted = 0;
    let directUpserted = 0;
    for (const snapshot of snapshots.filter((s) => s.service !== "portal")) {
      const mode = await postCapabilitySnapshot(snapshot);
      if (mode === "api") apiPosted += 1;
      else directUpserted += 1;
    }

    return {
      ok: true,
      message: `collected ${snapshots.length} capability snapshot(s)`,
      meta: {
        services: snapshots.map((snapshot) => snapshot.service),
        apiPosted,
        directUpserted,
      },
    };
  },
};
