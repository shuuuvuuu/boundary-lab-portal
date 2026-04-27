import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notifyDiscord } from "@/lib/alerts/discord";
import { sendOpsEmail } from "@/lib/alerts/email";
import type { CronJob, Job, JobContext, JobResult } from "./types";

/**
 * Phase A3: in-memory cron / scheduled job ランナー。
 *
 * 動作仕様:
 *   1. すべてのジョブは `process.env.JOB_RUNNER_ENABLED === "true"` の時のみ起動。
 *      未設定 or false の時はスケジュール起動を一切しない（手動 API 経由は許す）。
 *   2. cron ジョブは「次回実行時刻まで setTimeout、その後 setInterval」のシンプル方式。
 *      ローカル時計 vs UTC のずれ対策として全スケジュールは UTC 基準で記述する。
 *   3. ジョブ実行は Supabase `job_runs` に開始 / 終了レコードを書く。失敗は Discord / Email に通知。
 *   4. 既に動いているジョブを再度 fire しないよう per-job in-flight ロックを持つ。
 *
 * ランナー単一プロセス想定の罠:
 *   - portal を複数 instance に増やしたら同じジョブが多重実行される。
 *     その時は `JOB_RUNNER_ENABLED` を片方だけ true にする運用にする。
 *     Phase A3 時点では Droplet 1 instance なので問題ない。
 */

type GlobalScheduler = typeof globalThis & {
  __boundaryPortalJobRunner__?: {
    started: true;
    timers: NodeJS.Timeout[];
    inflight: Set<string>;
  };
};

const GLOBAL_KEY = "__boundaryPortalJobRunner__";

const ALERT_LEVEL = "error" as const;

function getGlobalState(): GlobalScheduler[typeof GLOBAL_KEY] | undefined {
  return (globalThis as GlobalScheduler)[GLOBAL_KEY];
}

function ensureGlobalState(): NonNullable<GlobalScheduler[typeof GLOBAL_KEY]> {
  const g = globalThis as GlobalScheduler;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { started: true, timers: [], inflight: new Set() };
  }
  return g[GLOBAL_KEY]!;
}

function getSupabaseWriter(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function persistRunStart(
  job: Job,
  ctx: JobContext,
): Promise<string | null> {
  const supabase = getSupabaseWriter();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("job_runs")
      .insert({
        job_name: job.name,
        job_kind: job.kind,
        trigger: ctx.trigger,
        started_at: ctx.firedAt,
        status: "running",
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[job-runner] persistRunStart failed:", error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.warn(
      "[job-runner] persistRunStart threw:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

async function persistRunEnd(
  runId: string | null,
  job: Job,
  result: JobResult,
  durationMs: number,
): Promise<void> {
  if (!runId) return;
  const supabase = getSupabaseWriter();
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: result.ok ? "ok" : "failed",
        duration_ms: durationMs,
        message: result.message ?? null,
        meta: result.meta ?? {},
      })
      .eq("id", runId);
    if (error) {
      console.warn("[job-runner] persistRunEnd failed:", error.message);
    }
  } catch (err) {
    console.warn(
      "[job-runner] persistRunEnd threw:",
      err instanceof Error ? err.message : String(err),
    );
  }

  // 失敗時は通知する。成功時は静かに完了させる。
  if (!result.ok) {
    const fields = {
      job: job.name,
      kind: job.kind,
      duration_ms: durationMs,
      message: result.message ?? "(no message)",
    };
    try {
      await notifyDiscord(
        ALERT_LEVEL,
        `[job-runner] ${job.name} failed`,
        fields,
      );
    } catch (err) {
      console.error(
        "[job-runner] discord notify failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
    try {
      await sendOpsEmail({
        subject: `[Boundary LAB] job ${job.name} failed`,
        text: `Job: ${job.name}\nKind: ${job.kind}\nDuration: ${durationMs}ms\nMessage: ${result.message ?? "(no message)"}`,
      });
    } catch (err) {
      console.error(
        "[job-runner] email notify failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

/** 1 回分のジョブ実行。手動 API からも呼ぶ。 */
export async function runJobOnce(
  job: Job,
  trigger: JobContext["trigger"] = "manual",
): Promise<JobResult> {
  const state = ensureGlobalState();
  if (state.inflight.has(job.name)) {
    return {
      ok: false,
      message: "already in-flight (skipped to prevent overlap)",
    };
  }
  state.inflight.add(job.name);

  const start = Date.now();
  const ctx: JobContext = {
    firedAt: new Date().toISOString(),
    trigger,
  };
  const runId = await persistRunStart(job, ctx);

  let result: JobResult;
  try {
    result = await job.handler(ctx);
  } catch (err) {
    result = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      meta: {
        stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined,
      },
    };
  } finally {
    state.inflight.delete(job.name);
  }

  const durationMs = Date.now() - start;
  await persistRunEnd(runId, job, result, durationMs);
  return result;
}

/**
 * 次回実行までのミリ秒を計算する。
 * `daily` / `weekly` / `every` を全部この関数で吸収する。
 *
 * `daily` / `weekly` は UTC 基準。`every` はそのまま intervalMs。
 */
export function nextDelayMs(job: CronJob, now: Date = new Date()): number {
  if (job.schedule.type === "every") {
    return Math.max(1_000, job.schedule.intervalMs);
  }

  const hour = job.schedule.hourUtc;
  const minute = job.schedule.minuteUtc;

  if (job.schedule.type === "daily") {
    const next = new Date(now);
    next.setUTCHours(hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  // weekly
  const targetWeekday = job.schedule.weekday;
  const next = new Date(now);
  next.setUTCHours(hour, minute, 0, 0);
  let diff = (targetWeekday - next.getUTCDay() + 7) % 7;
  if (diff === 0 && next.getTime() <= now.getTime()) diff = 7;
  next.setUTCDate(next.getUTCDate() + diff);
  return next.getTime() - now.getTime();
}

/** cron 1 件をスケジュールに登録する。 */
function scheduleCron(job: CronJob, state: NonNullable<GlobalScheduler[typeof GLOBAL_KEY]>) {
  if (job.disabled) {
    console.info(`[job-runner] ${job.name} disabled, skip`);
    return;
  }
  const fire = () => {
    void runJobOnce(job, "scheduled");
  };
  const initial = nextDelayMs(job);
  console.info(
    `[job-runner] schedule ${job.name} (kind=cron, schedule=${JSON.stringify(job.schedule)}) first in ${Math.round(initial / 1000)}s`,
  );
  const first = setTimeout(() => {
    fire();
    if (job.schedule.type === "every") {
      const loop = setInterval(fire, job.schedule.intervalMs);
      state.timers.push(loop);
    } else {
      // daily / weekly: 24h or 7d 周期で next を再計算してリスケ
      const reschedule = () => {
        const delay = nextDelayMs(job);
        const t = setTimeout(() => {
          fire();
          reschedule();
        }, delay);
        state.timers.push(t);
      };
      reschedule();
    }
  }, initial);
  state.timers.push(first);
}

/**
 * jobs を渡してスケジュール起動する。
 * 既に起動済なら何もしない。
 */
export function startJobRunner(jobs: Job[]): void {
  if (process.env.JOB_RUNNER_ENABLED !== "true") {
    console.info("[job-runner] JOB_RUNNER_ENABLED != 'true'. skip");
    return;
  }
  if (getGlobalState()?.started) {
    console.info("[job-runner] already started (skip re-init)");
    return;
  }
  const state = ensureGlobalState();

  for (const job of jobs) {
    if (job.kind === "cron") {
      scheduleCron(job, state);
    } else {
      console.info(`[job-runner] register manual-only job: ${job.name}`);
    }
  }

  console.info(`[job-runner] started ${jobs.length} job(s)`);
}

/** ジョブ一覧 (UI 表示用)。 */
export function summarizeJobs(jobs: Job[]) {
  return jobs.map((j) => {
    if (j.kind === "cron") {
      return {
        name: j.name,
        kind: j.kind,
        description: j.description,
        schedule: j.schedule,
        disabled: j.disabled ?? false,
      } as const;
    }
    return {
      name: j.name,
      kind: j.kind,
      description: j.description,
    } as const;
  });
}
