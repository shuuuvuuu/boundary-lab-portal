import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { getIssue } from "@/lib/sentry/client";

export const GET = withRateLimit(
  { max: 20, windowMs: 60_000, scope: "admin-sentry-issue-detail" },
  withAuth<{ id: string }>(async (_request, { user, params }) => {
    if (!isOwnerEmail(user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const resolved = params ? await params : { id: "" };
    const issueId = resolved.id;
    if (!issueId) {
      return NextResponse.json({ error: "missing issue id" }, { status: 400 });
    }

    try {
      const detail = await getIssue(issueId);
      return NextResponse.json({ issue: detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
