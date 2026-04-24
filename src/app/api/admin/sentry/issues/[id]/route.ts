import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { getIssue, getServiceConfig, type SentryService } from "@/lib/sentry/client";

function parseService(url: URL): SentryService | null {
  const raw = url.searchParams.get("service");
  if (raw === null || raw === "") return "boundary";
  if (raw === "boundary" || raw === "rezona") return raw;
  return null;
}

export const GET = withRateLimit(
  { max: 20, windowMs: 60_000, scope: "admin-sentry-issue-detail" },
  withAuth<{ id: string }>(async (request, { user, params }) => {
    if (!isOwnerEmail(user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const service = parseService(url);
    if (service === null) {
      return NextResponse.json(
        { error: "invalid service (must be 'boundary' or 'rezona')" },
        { status: 400 },
      );
    }

    const resolved = params ? await params : { id: "" };
    const issueId = resolved.id;
    if (!issueId) {
      return NextResponse.json({ error: "missing issue id" }, { status: 400 });
    }

    const config = getServiceConfig(service);
    if (!config) {
      return NextResponse.json({ issue: null, service, configured: false });
    }

    try {
      const detail = await getIssue(issueId, { service });
      if (!detail) {
        return NextResponse.json({ issue: null, service, configured: false });
      }
      return NextResponse.json({ issue: detail, service, configured: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
