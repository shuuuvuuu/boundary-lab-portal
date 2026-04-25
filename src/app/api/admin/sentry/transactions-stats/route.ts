import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import {
  getServiceConfig,
  listTransactionTimeSeries,
  type SentryService,
  type SentryTimeSeries,
} from "@/lib/sentry/client";

/**
 * GET /api/admin/sentry/transactions-stats
 *
 * Phase 2.1 Traces タブ時系列グラフ用。
 * 全 service/project 横断で transaction 単位の時系列を取得する。
 *
 * クエリ: ?service=boundary|rezona&statsPeriod=1h|24h|7d&yAxis=p95|p50|count&topEvents=5
 */
type SeriesWithProjectTag = SentryTimeSeries & {
  _projectTag: string;
  _service: SentryService;
};

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

function parseYAxis(url: URL): "p95" | "p50" | "count" {
  const raw = url.searchParams.get("yAxis") ?? "p95";
  if (raw === "p50" || raw === "count") return raw;
  return "p95";
}

function parseTopEvents(url: URL): number {
  const raw = Number(url.searchParams.get("topEvents") ?? "5");
  if (!Number.isFinite(raw) || raw < 1 || raw > 10) return 5;
  return Math.floor(raw);
}

function projectTagFor(service: SentryService, projectSlug: string, index: number): string {
  if (service === "boundary") return index === 0 ? "server" : "web";
  if (index === 0) return "server";
  if (index === 1) return "web";
  return projectSlug;
}

export const GET = withRateLimit(
  { max: 10, windowMs: 60_000, scope: "admin-sentry-tx-stats" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = parseService(url);
    const statsPeriod = parseStatsPeriod(url);
    const yAxis = parseYAxis(url);
    const topEvents = parseTopEvents(url);

    if (service === null) {
      return NextResponse.json({ error: "invalid service" }, { status: 400 });
    }

    const config = getServiceConfig(service);
    if (!config) {
      return NextResponse.json({
        series: [],
        service,
        statsPeriod,
        yAxis,
        configured: false,
      });
    }

    try {
      const results = await Promise.all(
        config.projects.map((slug) =>
          listTransactionTimeSeries(slug, { service, statsPeriod, yAxis, topEvents }).catch(
            (err: Error) => {
              console.error(`[sentry] ${service}/${slug} tx-stats failed:`, err.message);
              return [] as SentryTimeSeries[];
            },
          ),
        ),
      );

      const merged: SeriesWithProjectTag[] = [];
      config.projects.forEach((slug, idx) => {
        const tag = projectTagFor(service, slug, idx);
        for (const s of results[idx] ?? []) {
          merged.push({ ...s, _projectTag: tag, _service: service });
        }
      });

      return NextResponse.json({
        series: merged,
        service,
        statsPeriod,
        yAxis,
        topEvents,
        configured: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
