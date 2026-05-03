import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, withOwnerOrGuest } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

/**
 * GET /api/admin/logs?source=rezona-server&level=warn&hours=24&limit=200
 *
 * service_logs から外部サービス pino ログを取得する。
 * portal が直接受信したログを表示する。
 */

const ALLOWED_LEVELS = new Set(["all", "debug", "info", "warn", "error", "fatal"]);

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-service-logs" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const source = url.searchParams.get("source");
    const level = url.searchParams.get("level") ?? "all";
    const periodRaw = url.searchParams.get("period");
    let hours = 24;
    let sinceIso: string | null;
    if (periodRaw === "1h") {
      hours = 1;
      sinceIso = new Date(Date.now() - 3600_000).toISOString();
    } else if (periodRaw === "7h") {
      hours = 7;
      sinceIso = new Date(Date.now() - 7 * 3600_000).toISOString();
    } else if (periodRaw === "24h") {
      hours = 24;
      sinceIso = new Date(Date.now() - 24 * 3600_000).toISOString();
    } else if (periodRaw === "all") {
      sinceIso = null;
    } else {
      hours = Math.max(1, Math.min(7 * 24, Number(url.searchParams.get("hours") ?? "24") || 24));
      sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    }
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") ?? "200") || 200));

    if (source && (!/^[a-zA-Z0-9_:.-]+$/.test(source) || source.length > 80)) {
      return NextResponse.json({ error: "invalid 'source'" }, { status: 400 });
    }
    if (!ALLOWED_LEVELS.has(level)) {
      return NextResponse.json({ error: "invalid 'level'" }, { status: 400 });
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
      .from("service_logs")
      .select("id, source, level, message, context, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (sinceIso !== null) q = q.gte("occurred_at", sinceIso);
    if (source) q = q.eq("source", source);
    if (level !== "all") q = q.eq("level", level);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // sources 一覧 (UI 用)
    let sourcesQ = supabase
      .from("service_logs")
      .select("source")
      .limit(10_000);
    if (sinceIso !== null) sourcesQ = sourcesQ.gte("occurred_at", sinceIso);
    const { data: sourcesData } = await sourcesQ;
    const sources = Array.from(
      new Set(((sourcesData as Array<{ source: string }> | null) ?? []).map((r) => r.source)),
    ).sort();

    return NextResponse.json({
      logs: data ?? [],
      sources,
      hours,
      level,
    });
  }),
);

// DELETE /api/admin/logs?before=<ISO 8601>   期間以前を削除
// DELETE /api/admin/logs?all=true            全削除
type DeleteResponse = {
  deleted: number; // 削除件数
};

export const DELETE = withRateLimit(
  { max: 5, windowMs: 60_000, scope: "admin-service-logs-delete" },
  withAuth(async (request, ctx) => {
    if (!isOwnerEmail(ctx.user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const all = url.searchParams.get("all") === "true";

    if (before && all) {
      return NextResponse.json(
        { error: "specify either 'before' or 'all=true', not both" },
        { status: 400 },
      );
    }
    if (!before && !all) {
      return NextResponse.json(
        { error: "missing parameter: 'before' or 'all=true'" },
        { status: 400 },
      );
    }
    if (before) {
      const t = Date.parse(before);
      if (Number.isNaN(t)) {
        return NextResponse.json(
          { error: "invalid 'before' (must be ISO 8601)" },
          { status: 400 },
        );
      }
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

    let q = supabase.from("service_logs").delete({ count: "exact" });
    if (before) {
      q = q.lt("occurred_at", before);
    } else {
      q = q.neq("id", "00000000-0000-0000-0000-000000000000");
    }

    const { error, count } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const response: DeleteResponse = { deleted: count ?? 0 };
    return NextResponse.json(response);
  }),
);
