import { createClient } from "@supabase/supabase-js";
import type { CronJob, JobResult } from "@/lib/scheduler/types";

type JsonObject = Record<string, unknown>;

type ServiceLogRow = {
  id: string;
  source: string;
  occurred_at: string;
  context: JsonObject;
};

type DeployEventRow = {
  id: string;
  service: string;
  server_id: string;
  release: string | null;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
};

type DeployEventUpsertRow = {
  service: string;
  server_id: string;
  release: string | null;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  context: JsonObject;
  updated_at: string;
};

type DeployEventGroup = {
  service: string;
  serverId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  occurredAts: string[];
  context: JsonObject;
  release: string | null;
};

const DEPLOY_EVENT_SOURCES = ["rezona-server"] as const;
const PAGE_SIZE = 1000;

function asRecord(value: unknown): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function stringField(record: JsonObject, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function deployEventKey(service: string, serverId: string): string {
  return `${service}\u0000${serverId}`;
}

async function fetchWatermark(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data, error } = await supabase
    .from("deploy_events")
    .select("last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`fetch watermark failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ last_seen_at: string }>;
  return rows[0]?.last_seen_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

async function fetchServiceLogsSince(
  supabase: ReturnType<typeof createClient>,
  sinceIso: string,
): Promise<ServiceLogRow[]> {
  const rows: ServiceLogRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("service_logs")
      .select("id, source, occurred_at, context")
      .in("source", [...DEPLOY_EVENT_SOURCES])
      .gte("occurred_at", sinceIso)
      .not("context->>server_id", "is", null)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`fetch service_logs failed: ${error.message}`);
    }

    const rawPageRows = (data ?? []) as ServiceLogRow[];
    const pageRows = rawPageRows.flatMap((row) => {
      const context = asRecord(row.context);
      if (!context) return [];
      return [{ ...row, context }];
    });
    rows.push(...pageRows);
    if (rawPageRows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function aggregateLogs(rows: ServiceLogRow[]): DeployEventGroup[] {
  const groups = new Map<string, DeployEventGroup>();

  for (const row of rows) {
    const serverId = stringField(row.context, "server_id");
    if (!serverId) continue;

    const key = deployEventKey(row.source, serverId);
    const existing = groups.get(key);
    const release = stringField(row.context, "release");
    if (!existing) {
      groups.set(key, {
        service: row.source,
        serverId,
        firstSeenAt: row.occurred_at,
        lastSeenAt: row.occurred_at,
        count: 1,
        occurredAts: [row.occurred_at],
        context: row.context,
        release,
      });
      continue;
    }

    if (Date.parse(row.occurred_at) < Date.parse(existing.firstSeenAt)) {
      existing.firstSeenAt = row.occurred_at;
    }
    if (Date.parse(row.occurred_at) >= Date.parse(existing.lastSeenAt)) {
      existing.lastSeenAt = row.occurred_at;
      existing.context = row.context;
      if (release !== null) existing.release = release;
    }
    existing.count += 1;
    existing.occurredAts.push(row.occurred_at);
  }

  return Array.from(groups.values());
}

async function fetchExistingDeployEvents(
  supabase: ReturnType<typeof createClient>,
  groups: DeployEventGroup[],
): Promise<Map<string, DeployEventRow>> {
  const existing = new Map<string, DeployEventRow>();
  const serverIdsByService = new Map<string, string[]>();

  for (const group of groups) {
    const ids = serverIdsByService.get(group.service) ?? [];
    ids.push(group.serverId);
    serverIdsByService.set(group.service, ids);
  }

  for (const [service, serverIds] of serverIdsByService) {
    const uniqueServerIds = Array.from(new Set(serverIds));
    const { data, error } = await supabase
      .from("deploy_events")
      .select("id, service, server_id, release, first_seen_at, last_seen_at, event_count")
      .eq("service", service)
      .in("server_id", uniqueServerIds);
    if (error) {
      throw new Error(`fetch deploy_events failed: ${error.message}`);
    }

    for (const row of (data ?? []) as DeployEventRow[]) {
      existing.set(deployEventKey(row.service, row.server_id), row);
    }
  }

  return existing;
}

function buildUpsertRows(
  groups: DeployEventGroup[],
  existingRows: Map<string, DeployEventRow>,
): DeployEventUpsertRow[] {
  const nowIso = new Date().toISOString();
  return groups.flatMap((group) => {
    const existing = existingRows.get(deployEventKey(group.service, group.serverId));
    if (!existing) {
      return [
        {
          service: group.service,
          server_id: group.serverId,
          release: group.release,
          first_seen_at: group.firstSeenAt,
          last_seen_at: group.lastSeenAt,
          event_count: group.count,
          context: group.context,
          updated_at: nowIso,
        },
      ];
    }

    const existingLastSeenMs = Date.parse(existing.last_seen_at);
    const increment = group.occurredAts.filter(
      (occurredAt) => Date.parse(occurredAt) > existingLastSeenMs,
    ).length;
    if (increment === 0 && (group.release === null || group.release === existing.release))
      return [];

    return [
      {
        service: group.service,
        server_id: group.serverId,
        release: group.release ?? existing.release,
        first_seen_at:
          Date.parse(group.firstSeenAt) < Date.parse(existing.first_seen_at)
            ? group.firstSeenAt
            : existing.first_seen_at,
        last_seen_at:
          Math.max(existingLastSeenMs, Date.parse(group.lastSeenAt)) === existingLastSeenMs
            ? existing.last_seen_at
            : group.lastSeenAt,
        event_count: existing.event_count + increment,
        context: group.context,
        updated_at: nowIso,
      },
    ];
  });
}

export const deployEventsSyncJob: CronJob = {
  kind: "cron",
  name: "deploy-events-sync",
  description: "5 分間隔で service_logs.context.server_id の出現を deploy_events に集約",
  schedule: { type: "every", intervalMs: 5 * 60_000 },
  handler: async (): Promise<JobResult> => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      const sinceIso = await fetchWatermark(supabase);
      const logs = await fetchServiceLogsSince(supabase, sinceIso);
      const groups = aggregateLogs(logs);
      const existing = await fetchExistingDeployEvents(supabase, groups);
      const rows = buildUpsertRows(groups, existing);

      if (rows.length > 0) {
        const { error } = await supabase
          .from("deploy_events")
          .upsert(rows, { onConflict: "service,server_id" });
        if (error) {
          return { ok: false, message: `upsert failed: ${error.message}` };
        }
      }

      return {
        ok: true,
        message: `scanned ${logs.length} logs, upserted ${rows.length} deploy events`,
        meta: {
          since: sinceIso,
          logs: logs.length,
          groups: groups.length,
          upserted: rows.length,
          sources: [...DEPLOY_EVENT_SOURCES],
        },
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
