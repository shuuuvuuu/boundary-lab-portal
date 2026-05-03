/**
 * Phase A3: scheduler 基盤
 *
 * 既存の health-poller / cert-checker と同じく Next.js の instrumentation 経由で
 * Node ランタイム起動時に立ち上げる、軽量な in-memory スケジューラ。
 *
 * 採用理由:
 *   - Droplet 側で `cron.d` や別コンテナを増やすと運用ポイントが増える
 *   - 既に poller / cert checker が同じ仕組みで稼働しており、整合性が取りやすい
 *   - JOBS は portal Next.js プロセス内で実行されるため、既存の Supabase /
 *     Discord webhook クライアントをそのまま流用できる
 *
 * 将来的に horizontal scale したくなったら `JOB_RUNNER_ENABLED=false` で一斉停止し、
 * 別プロセスへ移すのが想定経路。
 */

export type JobKind = "cron" | "scheduled";

export type JobResult = {
  ok: boolean;
  message?: string;
  /** ジョブ実装側が任意で残すデバッグメタ。Supabase に jsonb として保存される。 */
  meta?: Record<string, unknown>;
};

export type JobContext = {
  /** トリガー時刻 (UTC ISO 文字列)。 */
  firedAt: string;
  /** "scheduled" / "manual" / "boot" など、起動経緯のタグ。Supabase に保存。 */
  trigger: "scheduled" | "manual" | "boot";
};

export type JobHandler = (ctx: JobContext) => Promise<JobResult>;

export type CronJob = {
  kind: "cron";
  /** ジョブ識別子。Supabase の job_runs.job_name に書く。重複禁止。 */
  name: string;
  /**
   * 24h 以内の固定スケジュール。`{ hourUtc, minuteUtc }` 形式で「毎日この時刻に実行」。
   * 24h 超えのインターバルが要る場合は `everyHours` を使う。
   */
  schedule:
    | { type: "daily"; hourUtc: number; minuteUtc: number }
    | { type: "weekly"; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; hourUtc: number; minuteUtc: number }
    | { type: "every"; intervalMs: number };
  handler: JobHandler;
  /** ジョブ説明 (UI 表示用)。 */
  description: string;
  /** デフォルト false。true にすると JOB_RUNNER_ENABLED=true でもこのジョブだけ skip。 */
  disabled?: boolean;
};

export type ScheduledJob = {
  kind: "scheduled";
  name: string;
  /** 1 回限り、または手動トリガー専用。schedule は持たない。 */
  handler: JobHandler;
  description: string;
};

export type Job = CronJob | ScheduledJob;
