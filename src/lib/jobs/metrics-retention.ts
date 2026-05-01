import { createClient } from "@supabase/supabase-js";
import type { CronJob, JobResult } from "@/lib/scheduler/types";

/**
 * metrics-retention: service_metrics の古いレコードを削除する。
 *
 * 60 秒間隔で増えるテーブルなので、放置すると行数が爆発する。
 * 既定 30 日。env `METRICS_RETENTION_DAYS` で上書き可能。
 */
export const metricsRetentionJob: CronJob = {
  kind: "cron",
  name: "metrics-retention",
  description: "毎日 UTC 03:45: service_metrics の古いレコードを削除",
  schedule: { type: "daily", hourUtc: 3, minuteUtc: 45 },
  handler: async (): Promise<JobResult> => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const days = Number(process.env.METRICS_RETENTION_DAYS ?? "30") || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from("service_metrics")
      .delete({ count: "estimated" })
      .lt("captured_at", cutoff);
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
