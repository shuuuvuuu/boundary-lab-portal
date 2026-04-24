import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { clearCache } from "@/lib/sentry/client";

/**
 * POST /api/admin/ops/refresh
 *
 * Sentry client の in-memory cache を flush するだけ。
 * GUEST_OPS_ENABLED=true の時はゲストも呼べる（単なるキャッシュ破棄なので安全）。
 */
export const POST = withRateLimit(
  { max: 5, windowMs: 60_000, scope: "admin-ops-refresh" },
  withOwnerOrGuest(() => {
    clearCache();
    return NextResponse.json({ ok: true, clearedAt: new Date().toISOString() });
  }),
);

export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

export function PUT() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

export function DELETE() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

export function PATCH() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
