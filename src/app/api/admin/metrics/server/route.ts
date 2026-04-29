import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

/**
 * GET /api/admin/metrics/server?service=boundary|rezona&type=server|rooms|host|users|all
 *
 * boundary-server / rezona-server の /api/admin/metrics をプロキシで呼ぶ。
 *
 * - 認証: service ごとに shared secret ヘッダ名を切り替える
 *   - boundary: x-boundary-internal-secret
 *   - rezona  : x-rezona-internal-secret (Phase 3c 仕様、rezona の admin-metrics endpoint が期待)
 * - 接続: 同 Droplet 内 Docker network 経由 (boundary は server:4000 / rezona は env で指定)
 * - portal の owner/guest 認可は外側 (withOwnerOrGuest) で完結
 */

type ServiceConfig = {
  url: string;
  secret: string | null;
};

function resolveServiceConfig(service: string): ServiceConfig | null {
  if (service === "boundary") {
    return {
      url: process.env.BOUNDARY_INTERNAL_URL ?? "http://server:4000",
      secret: process.env.BOUNDARY_INTERNAL_SECRET ?? null,
    };
  }
  if (service === "rezona") {
    const url = process.env.REZONA_INTERNAL_URL;
    const secret =
      process.env.REZONA_INTERNAL_SECRET ?? process.env.BOUNDARY_INTERNAL_SECRET ?? null;
    // rezona は url が明示されない限り未設定扱い
    if (!url) return null;
    return { url, secret };
  }
  return null;
}

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-metrics-server" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = url.searchParams.get("service") ?? "boundary";
    if (service !== "boundary" && service !== "rezona") {
      return NextResponse.json(
        { error: "service must be boundary | rezona" },
        { status: 400 },
      );
    }

    const config = resolveServiceConfig(service);
    if (!config) {
      return NextResponse.json(
        {
          error: `${service} not configured on portal (set REZONA_INTERNAL_URL / REZONA_INTERNAL_SECRET)`,
          configured: false,
          service,
        },
        { status: 503 },
      );
    }
    if (!config.secret) {
      return NextResponse.json(
        {
          error: `internal secret missing for ${service}`,
          configured: false,
          service,
        },
        { status: 503 },
      );
    }

    const type = url.searchParams.get("type") ?? "all";
    const valid =
      type === "server" ||
      type === "rooms" ||
      type === "host" ||
      type === "users" ||
      type === "all";
    if (!valid) {
      return NextResponse.json(
        { error: "type must be server | rooms | host | users | all" },
        { status: 400 },
      );
    }

    const upstreamUrl = `${config.url}/api/admin/metrics${
      type === "all" ? "" : `?type=${type}`
    }`;

    const headerName =
      service === "rezona" ? "x-rezona-internal-secret" : "x-boundary-internal-secret";

    try {
      const res = await fetch(upstreamUrl, {
        headers: { [headerName]: config.secret },
        cache: "no-store",
      });
      const body = await res.json();
      return NextResponse.json(body, { status: res.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json(
        { error: `upstream fetch failed: ${message}`, service },
        { status: 502 },
      );
    }
  }),
);
