import { createClient } from "@supabase/supabase-js";
import type { CronJob } from "@/lib/scheduler/types";

/**
 * health-retention: service_health_checks の古いレコードを削除する。
 *
 * 60 秒間隔で増えるテーブルなので、放置すると行数が爆発する。
 * 既定 14 日。env `HEALTH_RETENTION_DAYS` で上書き可能。
 */
export const healthRetentionJob: CronJob = {
  kind: "cron",
  name: "health-retention",
  description: "毎日 UTC 03:30: service_health_checks の古いレコードを削除",
  schedule: { type: "daily", hourUtc: 3, minuteUtc: 30 },
  handler: async () => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const days = Number(process.env.HEALTH_RETENTION_DAYS ?? "14") || 14;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from("service_health_checks")
      .delete({ count: "estimated" })
      .lt("checked_at", cutoff);
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
