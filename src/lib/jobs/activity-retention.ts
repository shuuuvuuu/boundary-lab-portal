import { createClient } from "@supabase/supabase-js";
import type { CronJob } from "@/lib/scheduler/types";

/**
 * activity-retention: activity_events の古いレコードを削除する。
 *
 * Supabase で pg_cron が無効な環境でも retention を効かせるため、
 * portal 側のジョブからも削除をかける（重複しても影響なし）。
 *
 * 既定 30 日。env `ACTIVITY_RETENTION_DAYS` で上書き可能。
 */
export const activityRetentionJob: CronJob = {
  kind: "cron",
  name: "activity-retention",
  description: "毎日 UTC 03:00: activity_events の古いレコードを削除",
  schedule: { type: "daily", hourUtc: 3, minuteUtc: 0 },
  handler: async () => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const days = Number(process.env.ACTIVITY_RETENTION_DAYS ?? "30") || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from("activity_events")
      .delete({ count: "estimated" })
      .lt("occurred_at", cutoff);
    if (error) {
      return { ok: false, message: `delete failed: ${error.message}` };
    }
    return {
      ok: true,
      message: `deleted ~${count ?? 0} rows (cutoff=${cutoff})`,
      meta: { cutoff, deleted: count ?? 0, retention_days: days },
    };
  },
};
