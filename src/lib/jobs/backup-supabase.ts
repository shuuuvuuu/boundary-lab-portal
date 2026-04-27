import { createClient } from "@supabase/supabase-js";
import type { CronJob } from "@/lib/scheduler/types";
import { uploadBackupArtifact } from "@/lib/backup/r2";

/**
 * backup-supabase: portal が使う public schema (profiles / activity_events / service_health_checks /
 * service_logs / job_runs / ops_todos など) の行カウントとサンプルを R2 に snapshot する。
 *
 * 完全な pg_dump は Droplet 上で `pg_dump --schema=public` を回さないと取れないが、portal プロセスから
 * Supabase JS で SELECT して JSONL に落とす方式でも十分な復旧基準点になる。
 *
 * Phase A3 では小規模 (1k〜10k 行 / table) のテーブルだけが対象なので JSONL 全件 dump で十分。
 * 大きくなったら `pg_dump` を Droplet 側でスケジュールする方式に切り替える。
 */

const TARGET_TABLES = [
  "profiles",
  "activity_events",
  "service_health_checks",
  "service_logs",
  "job_runs",
  "ops_todos",
] as const;

const PER_TABLE_LIMIT = 50_000;

export const backupSupabaseJob: CronJob = {
  kind: "cron",
  name: "backup-supabase",
  description: "毎週日曜 UTC 18:00: portal Supabase の主要テーブルを R2 に snapshot",
  schedule: { type: "weekly", weekday: 0, hourUtc: 18, minuteUtc: 0 },
  handler: async (ctx) => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { ok: false, message: "supabase env not configured" };
    }
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const summary: Array<{ table: string; rows: number; bytes: number }> = [];
    const now = new Date(ctx.firedAt);
    const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
    const baseKey = `boundary-backups/supabase/${yyyymmdd}`;

    for (const table of TARGET_TABLES) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .limit(PER_TABLE_LIMIT);
      if (error) {
        // 存在しないテーブルや権限エラーはスキップして次へ
        console.warn(
          `[backup-supabase] skip ${table}: ${error.message}`,
        );
        summary.push({ table, rows: 0, bytes: 0 });
        continue;
      }
      const rows = Array.isArray(data) ? data : [];
      const jsonl = rows.map((r) => JSON.stringify(r)).join("\n");
      const buffer = Buffer.from(jsonl, "utf8");

      try {
        await uploadBackupArtifact({
          key: `${baseKey}/${table}.jsonl`,
          contentType: "application/x-ndjson",
          body: buffer,
        });
        summary.push({ table, rows: rows.length, bytes: buffer.byteLength });
      } catch (err) {
        return {
          ok: false,
          message: `upload ${table} failed: ${err instanceof Error ? err.message : String(err)}`,
          meta: { partial: summary },
        };
      }
    }

    // メタ情報
    const manifest = {
      generated_at: ctx.firedAt,
      tables: summary,
      base_key: baseKey,
    };
    try {
      await uploadBackupArtifact({
        key: `${baseKey}/manifest.json`,
        contentType: "application/json",
        body: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      });
    } catch (err) {
      return {
        ok: false,
        message: `upload manifest failed: ${err instanceof Error ? err.message : String(err)}`,
        meta: { partial: summary },
      };
    }

    return {
      ok: true,
      message: `backed up ${summary.length} tables to ${baseKey}`,
      meta: { tables: summary },
    };
  },
};
