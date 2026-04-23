import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { listEvents, type SentryLogEvent } from "@/lib/sentry/client";

const SERVER_PROJECT = process.env.SENTRY_SERVER_PROJECT ?? "boundary-metaverse-server";
const WEB_PROJECT = process.env.SENTRY_WEB_PROJECT ?? "boundary-metaverse-web";

/**
 * GET /api/admin/sentry/events?level=warning|error
 *
 * Phase 1 (monitoring) Logs タブ用。
 * pino-sentry-transport 経由で送信された warn/error ログを Event 単位で返す。
 * level 指定が無い場合は warning/error/fatal を全て対象とする。
 */
type EventWithProjectTag = SentryLogEvent & { _projectTag: "server" | "web" };

function parseLevel(url: URL): "warning" | "error" | undefined {
  const raw = url.searchParams.get("level");
  if (raw === "warning" || raw === "error") return raw;
  return undefined;
}

export const GET = withRateLimit(
  { max: 10, windowMs: 60_000, scope: "admin-sentry-events" },
  withAuth(async (request, { user }) => {
    if (!isOwnerEmail(user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const level = parseLevel(url);

    try {
      const [serverEvents, webEvents] = await Promise.all([
        listEvents(SERVER_PROJECT, { level }).catch((err: Error) => {
          console.error("[sentry] server events failed:", err.message);
          return [] as SentryLogEvent[];
        }),
        listEvents(WEB_PROJECT, { level }).catch((err: Error) => {
          console.error("[sentry] web events failed:", err.message);
          return [] as SentryLogEvent[];
        }),
      ]);

      const merged: EventWithProjectTag[] = [
        ...serverEvents.map((e) => ({ ...e, _projectTag: "server" as const })),
        ...webEvents.map((e) => ({ ...e, _projectTag: "web" as const })),
      ].sort((a, b) => (a.dateCreated < b.dateCreated ? 1 : -1));

      return NextResponse.json({ events: merged, level: level ?? "all" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
