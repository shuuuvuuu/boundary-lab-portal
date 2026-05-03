import { createClient } from "@supabase/supabase-js";
import type { CronJob, JobResult } from "@/lib/scheduler/types";

export const deployEventsRetentionJob: CronJob = {
  kind: "cron",
  name: "deploy-events-retention",
  description: "毎日 UTC 03:50: 古い deploy_events を削除",
  schedule: { type: "daily", hourUtc: 3, minuteUtc: 50 },
  handler: async (): Promise<JobResult> => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from("deploy_events")
      .delete({ count: "estimated" })
      .lt("last_seen_at", cutoff);
    if (error) {
      return { ok: false, message: `delete failed: ${error.message}` };
    }
    return {
      ok: true,
      message: `deleted ~${count ?? 0} rows (cutoff=${cutoff})`,
      meta: { cutoff, deleted: count ?? 0, retention_days: 90 },
    };
  },
};
