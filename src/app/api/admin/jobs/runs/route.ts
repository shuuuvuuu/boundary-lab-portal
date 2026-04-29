import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

/**
 * GET /api/admin/jobs/runs?job=<name>&limit=<n>
 *
 * job_runs から直近実行履歴を返す。
 *  - job 指定: その job の履歴
 *  - 未指定: 全 job の混在履歴 (新しい順)
 */
export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-jobs-runs" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const job = url.searchParams.get("job");
    const period = url.searchParams.get("period");
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(200, Number(limitRaw ?? "50") || 50));

    if (job && (!/^[a-zA-Z0-9_-]+$/.test(job) || job.length > 60)) {
      return NextResponse.json({ error: "invalid 'job'" }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !key) {
      return NextResponse.json(
        { error: "supabase service role not configured" },
        { status: 500 },
      );
    }
    const supabase = createClient(supabaseUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let q = supabase
      .from("job_runs")
      .select("id, job_name, job_kind, trigger, status, started_at, finished_at, duration_ms, message, meta")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (job) q = q.eq("job_name", job);
    if (period === "1h") {
      q = q.gte("started_at", new Date(Date.now() - 3600_000).toISOString());
    } else if (period === "7h") {
      q = q.gte("started_at", new Date(Date.now() - 7 * 3600_000).toISOString());
    } else if (period === "24h") {
      q = q.gte("started_at", new Date(Date.now() - 24 * 3600_000).toISOString());
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ runs: data ?? [] });
  }),
);
