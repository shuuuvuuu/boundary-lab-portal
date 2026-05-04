import { notifyDiscord } from "@/lib/alerts/discord";
import { getSupabaseCapabilityClient } from "@/lib/capability/store";
import type { CronJob, JobResult } from "@/lib/scheduler/types";

type JsonObject = Record<string, unknown>;
type ServiceLogRow = {
  id: string;
  message: string;
  context: unknown;
  occurred_at: string;
};

const LIVEKIT_UNREACHABLE = "livekit.metrics.unreachable";
const WINDOW_MS = 5 * 60_000;
const SUPPRESS_MS = 30 * 60_000;
let lastAlertSentAt = 0;

function asRecord(value: unknown): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as JsonObject;
}

function stringAt(record: JsonObject | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function isLiveKitUnreachable(row: ServiceLogRow): boolean {
  const context = asRecord(row.context);
  const event = stringAt(context, ["event", "event.name", "name", "message"]);
  return event === LIVEKIT_UNREACHABLE || row.message.includes(LIVEKIT_UNREACHABLE);
}

export const livekitUnreachableAlertJob: CronJob = {
  kind: "cron",
  name: "livekit-unreachable-alert",
  description: "5 分ごとに LiveKit unreachable 連続発生を Discord 通知",
  schedule: { type: "every", intervalMs: WINDOW_MS },
  handler: async (): Promise<JobResult> => {
    const supabase = getSupabaseCapabilityClient();
    if (!supabase) {
      return { ok: false, message: "supabase env not configured" };
    }

    const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("service_logs")
      .select("id, message, context, occurred_at")
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: false })
      .limit(1000);

    if (error) {
      return { ok: false, message: `service_logs query failed: ${error.message}` };
    }

    const rows = ((data ?? []) as ServiceLogRow[]).filter(isLiveKitUnreachable);
    if (rows.length < 5) {
      return {
        ok: true,
        message: `livekit unreachable below threshold (${rows.length}/5)`,
        meta: { count: rows.length, since: sinceIso },
      };
    }

    const now = Date.now();
    if (now - lastAlertSentAt < SUPPRESS_MS) {
      return {
        ok: true,
        message: "livekit unreachable alert suppressed",
        meta: { count: rows.length, since: sinceIso },
      };
    }

    await notifyDiscord("error", "LiveKit unreachable が 5 分連続で発生しています", {
      event: LIVEKIT_UNREACHABLE,
      count_5m: rows.length,
      since: sinceIso,
      latest: rows[0]?.occurred_at ?? null,
    });
    lastAlertSentAt = now;

    return {
      ok: true,
      message: `livekit unreachable alert sent (${rows.length})`,
      meta: { count: rows.length, since: sinceIso },
    };
  },
};
