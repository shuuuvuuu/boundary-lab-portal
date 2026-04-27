import type { Job } from "@/lib/scheduler/types";
import { healthSweepJob } from "./health-sweep";
import { weeklyReportJob } from "./weekly-report";
import { activityRetentionJob } from "./activity-retention";
import { healthRetentionJob } from "./health-retention";
import { airdropDryRunJob } from "./airdrop-dry-run";
import { todoNotifyJob } from "./todo-notify";
import { backupSupabaseJob } from "./backup-supabase";
import { backupSentryJob } from "./backup-sentry";

/**
 * Phase A3: ジョブ定義の集約。
 *
 * - cron: スケジュール実行ジョブ。スケジュールは UTC 基準。日本時間との時差を意識すること。
 * - scheduled (manual-only): 任意トリガジョブ。`/api/admin/jobs/run` 経由で代表が呼び出す想定。
 *
 * UTC ↔ JST のサンプル: JST 09:00 = UTC 00:00 (前日扱いになることに注意)
 */

export const JOBS: Job[] = [
  // 毎日 UTC 00:00 (JST 09:00): health 巡回 + 週次集計の前段
  healthSweepJob,
  // 週次レポートは毎週月曜 UTC 00:30 (JST 09:30)
  weeklyReportJob,
  // 毎日 UTC 03:00: 古い activity_events を削除 (pg_cron が無効な環境向け)
  activityRetentionJob,
  // 毎日 UTC 03:30: 古い service_health_checks を削除
  healthRetentionJob,
  // 毎日 UTC 04:00: rezona airdrop dry-run (本番状態は触らず portal 側 read-only 確認)
  airdropDryRunJob,
  // 毎日 UTC 23:00 (JST 08:00): TODO 期限通知 (期限 7 日以内 + 期限切れ)
  todoNotifyJob,
  // 毎週日曜 UTC 18:00 (JST 月曜 03:00): Supabase スキーマ + 行カウント snapshot
  backupSupabaseJob,
  // 毎週日曜 UTC 19:00 (JST 月曜 04:00): Sentry issue / event count export
  backupSentryJob,
];

export {
  healthSweepJob,
  weeklyReportJob,
  activityRetentionJob,
  healthRetentionJob,
  airdropDryRunJob,
  todoNotifyJob,
  backupSupabaseJob,
  backupSentryJob,
};
