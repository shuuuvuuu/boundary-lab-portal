import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import {
  getServiceConfig,
  getWebVitalTimeSeries,
  getWebVitalsSummary,
  type SentryService,
  type WebVitalKey,
} from "@/lib/sentry/client";

/**
 * GET /api/admin/sentry/web-vitals?service=...&statsPeriod=...&vital=lcp|fcp|cls|inp|ttfb
 *
 * vital が指定されていなければ summary（全 vital の現値 + count）のみ返す。
 * vital が指定されていれば summary + その vital の時系列を返す。
 */
function parseService(url: URL): SentryService | null {
  const raw = url.searchParams.get("service");
  if (raw === null || raw === "") return "boundary";
  if (raw === "boundary" || raw === "rezona") return raw;
  return null;
}

function parseStatsPeriod(url: URL): string {
  const raw = url.searchParams.get("statsPeriod") ?? "";
  if (/^\d{1,4}[mhd]$/.test(raw)) return raw;
  return "24h";
}

function parseVital(url: URL): WebVitalKey | null {
  const raw = url.searchParams.get("vital");
  if (raw === "lcp" || raw === "fcp" || raw === "cls" || raw === "inp" || raw === "ttfb") {
    return raw;
  }
  return null;
}

export const GET = withRateLimit(
  { max: 15, windowMs: 60_000, scope: "admin-sentry-web-vitals" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = parseService(url);
    if (service === null) {
      return NextResponse.json({ error: "invalid service" }, { status: 400 });
    }
    const statsPeriod = parseStatsPeriod(url);
    const vital = parseVital(url);

    const config = getServiceConfig(service);
    if (!config) {
      return NextResponse.json({
        summary: null,
        series: null,
        configured: false,
        service,
        statsPeriod,
      });
    }

    try {
      const [summary, series] = await Promise.all([
        getWebVitalsSummary({ service, statsPeriod }),
        vital ? getWebVitalTimeSeries(vital, { service, statsPeriod }) : Promise.resolve(null),
      ]);

      return NextResponse.json({
        summary,
        series,
        configured: true,
        service,
        statsPeriod,
        vital,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
