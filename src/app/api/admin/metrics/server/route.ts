import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

/**
 * GET /api/admin/metrics/server?type=server|rooms|all
 *
 * boundary-server の /api/admin/metrics をプロキシで呼ぶ。
 *
 * - 認証: shared secret (`BOUNDARY_INTERNAL_SECRET`) を x-boundary-internal-secret ヘッダで送る
 * - 接続: 同 Droplet 内の Docker network で server:4000 を直叩き
 * - portal の owner/guest 認可は外側 (withOwnerOrGuest) で完結
 *
 * boundary 以外のサービス (rezona) を将来統合する時は service クエリで分岐。
 */

const BOUNDARY_INTERNAL_URL =
  process.env.BOUNDARY_INTERNAL_URL ?? "http://server:4000";

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-metrics-server" },
  withOwnerOrGuest(async (request) => {
    const secret = process.env.BOUNDARY_INTERNAL_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "BOUNDARY_INTERNAL_SECRET not configured on portal side" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? "all";
    const valid = type === "server" || type === "rooms" || type === "all";
    if (!valid) {
      return NextResponse.json(
        { error: "type must be server | rooms | all" },
        { status: 400 },
      );
    }

    const upstreamUrl = `${BOUNDARY_INTERNAL_URL}/api/admin/metrics${
      type === "all" ? "" : `?type=${type}`
    }`;

    try {
      const res = await fetch(upstreamUrl, {
        headers: { "x-boundary-internal-secret": secret },
        cache: "no-store",
      });
      const body = await res.json();
      return NextResponse.json(body, { status: res.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json(
        { error: `upstream fetch failed: ${message}` },
        { status: 502 },
      );
    }
  }),
);
