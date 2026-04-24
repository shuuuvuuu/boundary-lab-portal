import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { findTarget, probeAndRecord } from "@/lib/health-poller";

/**
 * POST /api/admin/ops/probe
 *   body: { service: string } または query ?service=xxx
 *
 * env HEALTH_CHECK_TARGETS から該当 service を引き、即座に fetch → INSERT → evaluateAndAlert。
 * レスポンスに 1 件分の check record を返す。
 */
export const POST = withRateLimit(
  { max: 5, windowMs: 60_000, scope: "admin-ops-probe" },
  withAuth(async (request, { user }) => {
    if (!isOwnerEmail(user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    let service = url.searchParams.get("service") ?? "";

    if (!service) {
      try {
        const body = (await request.json().catch(() => ({}))) as { service?: string };
        service = body.service ?? "";
      } catch {
        // body 無しも許容
      }
    }

    if (!service) {
      return NextResponse.json({ error: "missing 'service'" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(service)) {
      return NextResponse.json({ error: "invalid 'service'" }, { status: 400 });
    }

    const target = findTarget(service);
    if (!target) {
      return NextResponse.json(
        { error: `service '${service}' is not in HEALTH_CHECK_TARGETS` },
        { status: 404 },
      );
    }

    const record = await probeAndRecord(target);
    return NextResponse.json({ check: record });
  }),
);

export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
