import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { listIssues, type SentryIssue } from "@/lib/sentry/client";

const SERVER_PROJECT = process.env.SENTRY_SERVER_PROJECT ?? "boundary-metaverse-server";
const WEB_PROJECT = process.env.SENTRY_WEB_PROJECT ?? "boundary-metaverse-web";

type IssueWithProjectTag = SentryIssue & { _projectTag: "server" | "web" };

export const GET = withRateLimit(
  { max: 10, windowMs: 60_000, scope: "admin-sentry-issues" },
  withAuth(async (_request, { user }) => {
    if (!isOwnerEmail(user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    try {
      const [serverIssues, webIssues] = await Promise.all([
        listIssues(SERVER_PROJECT).catch((err: Error) => {
          console.error("[sentry] server project failed:", err.message);
          return [] as SentryIssue[];
        }),
        listIssues(WEB_PROJECT).catch((err: Error) => {
          console.error("[sentry] web project failed:", err.message);
          return [] as SentryIssue[];
        }),
      ]);

      const merged: IssueWithProjectTag[] = [
        ...serverIssues.map((i) => ({ ...i, _projectTag: "server" as const })),
        ...webIssues.map((i) => ({ ...i, _projectTag: "web" as const })),
      ].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));

      return NextResponse.json({ issues: merged });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
