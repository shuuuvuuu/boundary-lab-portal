import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { JOBS } from "@/lib/jobs";
import { summarizeJobs } from "@/lib/scheduler/runner";

/**
 * GET /api/admin/jobs
 *
 * 登録済 cron / scheduled job の一覧と、ランナーが現在有効になっているかを返す。
 * Jobs タブで読み出して表示する。
 */
export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-jobs-list" },
  withOwnerOrGuest(() => {
    return NextResponse.json({
      runner_enabled: process.env.JOB_RUNNER_ENABLED === "true",
      jobs: summarizeJobs(JOBS),
    });
  }),
);
