import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import {
  getServiceConfig,
  listEvents,
  type SentryLogEvent,
  type SentryService,
} from "@/lib/sentry/client";

/**
 * GET /api/admin/sentry/events?level=warning|error&service=boundary|rezona
 *
 * Phase 1 (monitoring) Logs タブ用。
 * pino-sentry-transport 経由で送信された warn/error ログを Event 単位で返す。
 * level 指定が無い場合は warning/error/fatal を全て対象とする。
 */
type EventWithProjectTag = SentryLogEvent & { _projectTag: string; _service: SentryService };

function parseLevel(url: URL): "warning" | "error" | undefined {
  const raw = url.searchParams.get("level");
  if (raw === "warning" || raw === "error") return raw;
  return undefined;
}

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

function projectTagFor(service: SentryService, projectSlug: string, index: number): string {
  if (service === "boundary") {
    return index === 0 ? "server" : "web";
  }
  if (index === 0) return "server";
  if (index === 1) return "web";
  return projectSlug;
}

export const GET = withRateLimit(
  { max: 10, windowMs: 60_000, scope: "admin-sentry-events" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const level = parseLevel(url);
    const service = parseService(url);
    const statsPeriod = parseStatsPeriod(url);
    if (service === null) {
      return NextResponse.json(
        { error: "invalid service (must be 'boundary' or 'rezona')" },
        { status: 400 },
      );
    }

    const config = getServiceConfig(service);
    if (!config) {
      return NextResponse.json({
        events: [],
        level: level ?? "all",
        service,
        configured: false,
      });
    }

    try {
      const results = await Promise.all(
        config.projects.map((slug) =>
          listEvents(slug, { level, service, statsPeriod }).catch((err: Error) => {
            console.error(`[sentry] ${service}/${slug} events failed:`, err.message);
            return [] as SentryLogEvent[];
          }),
        ),
      );

      const merged: EventWithProjectTag[] = [];
      config.projects.forEach((slug, idx) => {
        const tag = projectTagFor(service, slug, idx);
        for (const event of results[idx] ?? []) {
          merged.push({ ...event, _projectTag: tag, _service: service });
        }
      });
      merged.sort((a, b) => (a.dateCreated < b.dateCreated ? 1 : -1));

      return NextResponse.json({
        events: merged,
        level: level ?? "all",
        service,
        configured: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
