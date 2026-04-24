import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { findTarget, probeAndRecord } from "@/lib/health-poller";
import { parseCertTargets, runCertCheckOnce } from "@/lib/cert-checker";

/**
 * POST /api/admin/ops/probe
 *   body: { service: string } または query ?service=xxx
 *
 * service が `cert:<host>` 形式 → CERT_CHECK_TARGETS に入っている host なら cert check 即実行。
 * それ以外 → HEALTH_CHECK_TARGETS から該当 service を引き、即座に fetch → INSERT → evaluateAndAlert。
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
    if (!/^[a-zA-Z0-9_.:-]+$/.test(service) || service.length > 120) {
      return NextResponse.json({ error: "invalid 'service'" }, { status: 400 });
    }

    if (service.startsWith("cert:")) {
      const host = service.slice("cert:".length);
      const hosts = parseCertTargets(process.env.CERT_CHECK_TARGETS);
      if (!hosts.includes(host)) {
        return NextResponse.json(
          { error: `host '${host}' is not in CERT_CHECK_TARGETS` },
          { status: 404 },
        );
      }
      const result = await runCertCheckOnce(host);
      return NextResponse.json({
        check: {
          service: `cert:${host}`,
          endpoint: `${host}:443`,
          status_code: null,
          response_time_ms: result.daysUntilExpiry,
          ok: result.ok,
          error_message: result.error,
          checked_at: new Date().toISOString(),
          expires_at: result.expiresAt,
        },
      });
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
