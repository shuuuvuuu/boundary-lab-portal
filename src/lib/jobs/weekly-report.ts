import { createClient } from "@supabase/supabase-js";
import type { CronJob } from "@/lib/scheduler/types";
import { notifyDiscord } from "@/lib/alerts/discord";
import { sendOpsEmail } from "@/lib/alerts/email";

/**
 * weekly-report: 過去 7 日のサービス別 uptime / activity 件数 / job 失敗件数を集計して
 * Discord + Email に投稿する。Phase A3 で代表が朝確認できるようにする。
 *
 * UTC 月曜 00:30 = JST 月曜 09:30。
 */

type HealthRow = { service: string; ok: boolean };
type JobRow = { job_name: string; status: string };

export const weeklyReportJob: CronJob = {
  kind: "cron",
  name: "weekly-report",
  description: "毎週月曜 UTC 00:30: 過去 7 日サマリを Discord + Email へ送信",
  schedule: { type: "weekly", weekday: 1, hourUtc: 0, minuteUtc: 30 },
  handler: async (ctx) => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1) health 集計
    const { data: healthData, error: healthErr } = await supabase
      .from("service_health_checks")
      .select("service, ok")
      .gte("checked_at", since)
      .limit(200_000);
    if (healthErr) {
      return { ok: false, message: `health select failed: ${healthErr.message}` };
    }
    const healthRows = (healthData as HealthRow[] | null) ?? [];
    const healthTotals = new Map<string, { ok: number; ng: number }>();
    for (const r of healthRows) {
      const cur = healthTotals.get(r.service) ?? { ok: 0, ng: 0 };
      if (r.ok) cur.ok += 1;
      else cur.ng += 1;
      healthTotals.set(r.service, cur);
    }

    // 2) activity_events 件数
    const { count: activityCount, error: activityErr } = await supabase
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", since);
    if (activityErr) {
      console.warn("[weekly-report] activity count failed:", activityErr.message);
    }

    // 3) job 失敗件数
    const { data: jobData, error: jobErr } = await supabase
      .from("job_runs")
      .select("job_name, status")
      .gte("started_at", since)
      .limit(50_000);
    if (jobErr) {
      console.warn("[weekly-report] job select failed:", jobErr.message);
    }
    const jobRows = (jobData as JobRow[] | null) ?? [];
    const jobFailures = new Map<string, number>();
    let jobTotal = 0;
    let jobFailedTotal = 0;
    for (const r of jobRows) {
      jobTotal += 1;
      if (r.status === "failed") {
        jobFailedTotal += 1;
        jobFailures.set(r.job_name, (jobFailures.get(r.job_name) ?? 0) + 1);
      }
    }

    // 4) 文章組み立て
    const lines: string[] = [];
    lines.push(`# 境界 LAB 週次レポート (${ctx.firedAt})`);
    lines.push("");
    lines.push("## Health Uptime (過去 7 日)");
    if (healthTotals.size === 0) {
      lines.push("- 記録なし");
    } else {
      for (const [service, t] of Array.from(healthTotals.entries()).sort()) {
        const total = t.ok + t.ng;
        const pct = total === 0 ? 0 : ((t.ok / total) * 100).toFixed(2);
        lines.push(`- ${service}: ${pct}% (${t.ok}/${total})`);
      }
    }
    lines.push("");
    lines.push("## Activity");
    lines.push(`- イベント件数: ${activityCount ?? 0}`);
    lines.push("");
    lines.push("## Jobs");
    lines.push(`- 実行 ${jobTotal} / 失敗 ${jobFailedTotal}`);
    if (jobFailures.size > 0) {
      lines.push("- 失敗内訳:");
      for (const [name, count] of jobFailures) {
        lines.push(`  - ${name}: ${count}`);
      }
    }

    const body = lines.join("\n");

    // Discord
    try {
      await notifyDiscord("info", "週次レポート", {
        health_services: healthTotals.size,
        activity_events: activityCount ?? 0,
        jobs_total: jobTotal,
        jobs_failed: jobFailedTotal,
      });
    } catch (err) {
      console.warn(
        "[weekly-report] discord failed:",
        err instanceof Error ? err.message : String(err),
      );
    }

    // Email (本文に詳細)
    try {
      await sendOpsEmail({
        subject: `[Boundary LAB] 週次レポート ${ctx.firedAt.slice(0, 10)}`,
        text: body,
      });
    } catch (err) {
      return {
        ok: false,
        message: `email send failed: ${err instanceof Error ? err.message : String(err)}`,
        meta: { body },
      };
    }

    return {
      ok: true,
      message: `report sent (services=${healthTotals.size}, jobs_failed=${jobFailedTotal})`,
      meta: {
        health_services: healthTotals.size,
        activity_events: activityCount ?? 0,
        jobs_total: jobTotal,
        jobs_failed: jobFailedTotal,
      },
    };
  },
};
