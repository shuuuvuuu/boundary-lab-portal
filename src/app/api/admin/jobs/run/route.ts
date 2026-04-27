import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { JOBS } from "@/lib/jobs";
import { runJobOnce } from "@/lib/scheduler/runner";

/**
 * POST /api/admin/jobs/run
 *   body: { name: string }
 *
 * 指定された job を手動でトリガする。
 * - 認証必須 (owner email のみ)
 * - GUEST_OPS_ENABLED 中でもゲストは弾く (副作用あるため)
 */
export const POST = withRateLimit(
  { max: 5, windowMs: 60_000, scope: "admin-jobs-run" },
  withAuth(async (request, ctx) => {
    if (!isOwnerEmail(ctx.user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    let name = "";
    try {
      const body = (await request.json().catch(() => ({}))) as { name?: string };
      name = body.name ?? "";
    } catch {
      // ignore
    }
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.length > 60) {
      return NextResponse.json({ error: "invalid 'name'" }, { status: 400 });
    }

    const job = JOBS.find((j) => j.name === name);
    if (!job) {
      return NextResponse.json(
        { error: `job '${name}' not found` },
        { status: 404 },
      );
    }

    const result = await runJobOnce(job, "manual");
    return NextResponse.json({
      job: name,
      result,
    });
  }),
);
