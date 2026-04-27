import { createClient } from "@supabase/supabase-js";
import type { CronJob } from "@/lib/scheduler/types";
import { notifyDiscord } from "@/lib/alerts/discord";

/**
 * todo-notify: ops_todos テーブルから期限 7 日以内 / 期限切れの未完了 TODO を集計し、
 * Discord に投稿する。
 *
 * テーブル `ops_todos` (Phase A3 で新設):
 *   id, title, due_at (timestamptz), status ('open'|'done'), priority, created_at
 *
 * テーブルが存在しない時は ok=true で no-op (運用導入が任意のため)。
 */

type TodoRow = {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
  priority: number | null;
};

export const todoNotifyJob: CronJob = {
  kind: "cron",
  name: "todo-notify",
  description: "毎日 UTC 23:00: 期限間近 / 期限切れ TODO を Discord 通知",
  schedule: { type: "daily", hourUtc: 23, minuteUtc: 0 },
  handler: async (ctx) => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date(ctx.firedAt);
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from("ops_todos")
      .select("id, title, due_at, status, priority")
      .eq("status", "open")
      .not("due_at", "is", null)
      .lte("due_at", sevenDaysLater.toISOString())
      .order("due_at", { ascending: true });

    if (error) {
      // テーブル未作成は no-op 扱い
      if (
        error.message.includes("relation") ||
        error.message.includes("does not exist") ||
        error.code === "42P01"
      ) {
        return { ok: true, message: "ops_todos テーブル未作成のため no-op" };
      }
      return { ok: false, message: `select failed: ${error.message}` };
    }

    const rows = (data as TodoRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        ok: true,
        message: "通知対象の TODO なし",
        meta: { count: 0 },
      };
    }

    const overdue: TodoRow[] = [];
    const upcoming: TodoRow[] = [];
    for (const r of rows) {
      if (!r.due_at) continue;
      if (new Date(r.due_at).getTime() < now.getTime()) overdue.push(r);
      else upcoming.push(r);
    }

    const summary = [
      `期限切れ: ${overdue.length} 件`,
      `7 日以内: ${upcoming.length} 件`,
    ].join(" / ");

    const sample = [...overdue.slice(0, 3), ...upcoming.slice(0, 3)]
      .map((r) => `- ${r.title} (${r.due_at})`)
      .join("\n");

    try {
      await notifyDiscord(
        overdue.length > 0 ? "warn" : "info",
        `[ops-todos] ${summary}`,
        {
          overdue: overdue.length,
          upcoming_7d: upcoming.length,
          sample: sample || "(no items)",
        },
      );
    } catch (err) {
      return {
        ok: false,
        message: `discord failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return {
      ok: true,
      message: summary,
      meta: { overdue: overdue.length, upcoming: upcoming.length },
    };
  },
};
