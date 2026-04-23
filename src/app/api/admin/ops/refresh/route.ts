import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { clearCache } from "@/lib/sentry/client";

export const POST = withRateLimit(
  { max: 5, windowMs: 60_000, scope: "admin-ops-refresh" },
  withAuth((_request, { user }) => {
    if (!isOwnerEmail(user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

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
