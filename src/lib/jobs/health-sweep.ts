import { createClient } from "@supabase/supabase-js";
import type { CronJob } from "@/lib/scheduler/types";

/**
 * health-sweep: 直近 24h の service_health_checks を集計し、サービスごとの uptime% を Discord 風に整形して
 * service_logs に保存する（log タブで遡って読める）。
 *
 * 既存 health-poller / cert-checker は 60s〜24h 周期で結果を保存している。
 * このジョブは "健康診断のスナップショット" として日次サマリを残すのが目的。
 */

type Row = {
  service: string;
  ok: boolean;
};

export const healthSweepJob: CronJob = {
  kind: "cron",
  name: "health-sweep-daily",
  description: "毎日 UTC 00:00: 直近 24h の health 集計を service_logs に記録",
  schedule: { type: "daily", hourUtc: 0, minuteUtc: 0 },
  handler: async (ctx) => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("service_health_checks")
      .select("service, ok")
      .gte("checked_at", since)
      .limit(50_000);

    if (error) {
      return { ok: false, message: `select failed: ${error.message}` };
    }

    const rows = (data as Row[] | null) ?? [];
    const totals = new Map<string, { ok: number; ng: number }>();
    for (const r of rows) {
      const cur = totals.get(r.service) ?? { ok: 0, ng: 0 };
      if (r.ok) cur.ok += 1;
      else cur.ng += 1;
      totals.set(r.service, cur);
    }

    const summary = Array.from(totals.entries()).map(([service, t]) => ({
      service,
      total: t.ok + t.ng,
      ok: t.ok,
      ng: t.ng,
      uptime_percent: t.ok + t.ng === 0 ? 0 : Number(((t.ok / (t.ok + t.ng)) * 100).toFixed(2)),
    }));

    // service_logs に書く（受信エンドポイントと同じテーブル）
    const logRow = {
      source: "portal",
      level: "info" as const,
      message: "health sweep daily summary",
      context: {
        fired_at: ctx.firedAt,
        window_hours: 24,
        services: summary,
      },
    };
    const { error: insertErr } = await supabase.from("service_logs").insert(logRow);
    if (insertErr) {
      return {
        ok: false,
        message: `insert into service_logs failed: ${insertErr.message}`,
        meta: { summary },
      };
    }

    return {
      ok: true,
      message: `swept ${rows.length} rows across ${summary.length} services`,
      meta: { summary },
    };
  },
};
