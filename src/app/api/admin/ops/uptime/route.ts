import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { parseTargets } from "@/lib/health-poller";

/**
 * GET /api/admin/ops/uptime?service=rezona&hours=24
 *
 * 返り値:
 *   {
 *     service,
 *     hours,
 *     configured,         // env にターゲットがあるか
 *     endpoint,           // 監視対象 URL（configured=true のみ）
 *     checks: [...],
 *     summary: { total, ok, ng, uptime_percent, avg_response_ms, last_ok_at, last_ng_at }
 *   }
 */

const ALLOWED_HOURS = new Set([1, 6, 24, 24 * 7]);

function parseHours(url: URL): number {
  const raw = url.searchParams.get("hours");
  if (!raw) return 24;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 24;
  if (ALLOWED_HOURS.has(n)) return n;
  // 任意の正数を許容するが、最大 30 日にキャップ
  return Math.min(n, 24 * 30);
}

function parseService(url: URL): string | null {
  const raw = url.searchParams.get("service");
  if (!raw) return null;
  // service 名は英数 / - / _ のみ許容
  if (!/^[a-zA-Z0-9_-]+$/.test(raw)) return null;
  return raw;
}

type CheckRow = {
  id: string;
  service: string;
  endpoint: string;
  status_code: number | null;
  response_time_ms: number | null;
  ok: boolean;
  error_message: string | null;
  checked_at: string;
};

type Summary = {
  total: number;
  ok: number;
  ng: number;
  uptime_percent: number;
  avg_response_ms: number | null;
  last_ok_at: string | null;
  last_ng_at: string | null;
};

function computeSummary(rows: CheckRow[]): Summary {
  const total = rows.length;
  const okRows = rows.filter((r) => r.ok);
  const ngRows = rows.filter((r) => !r.ok);
  const responseSamples = okRows
    .map((r) => r.response_time_ms)
    .filter((v): v is number => typeof v === "number");
  const avg =
    responseSamples.length > 0
      ? Math.round(responseSamples.reduce((a, b) => a + b, 0) / responseSamples.length)
      : null;
  return {
    total,
    ok: okRows.length,
    ng: ngRows.length,
    uptime_percent: total === 0 ? 0 : Number(((okRows.length / total) * 100).toFixed(2)),
    avg_response_ms: avg,
    last_ok_at: okRows[0]?.checked_at ?? null, // rows は DESC
    last_ng_at: ngRows[0]?.checked_at ?? null,
  };
}

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-ops-uptime" },
  withAuth(async (request, { user }) => {
    if (!isOwnerEmail(user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const service = parseService(url);
    if (!service) {
      return NextResponse.json(
        { error: "missing or invalid 'service' query" },
        { status: 400 },
      );
    }
    const hours = parseHours(url);

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "supabase service role not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("service_health_checks")
      .select("id, service, endpoint, status_code, response_time_ms, ok, error_message, checked_at")
      .eq("service", service)
      .gte("checked_at", since)
      .order("checked_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("[uptime] select failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data as CheckRow[]) ?? [];
    const targets = parseTargets(process.env.HEALTH_CHECK_TARGETS);
    const configured = targets.find((t) => t.service === service);

    return NextResponse.json({
      service,
      hours,
      configured: Boolean(configured),
      endpoint: configured?.url ?? null,
      interval_seconds: configured?.intervalSeconds ?? null,
      checks: rows,
      summary: computeSummary(rows),
    });
  }),
);
