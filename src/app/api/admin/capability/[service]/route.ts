import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { getCapabilitySnapshot } from "@/lib/capability/store";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

const SERVICE_RE = /^[a-zA-Z0-9_:.-]+$/;

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-capability-get" },
  withOwnerOrGuest<{ service: string }>(async (_request, ctx) => {
    const params = await ctx.params;
    const service = params?.service ?? "";
    if (!service || service.length > 80 || !SERVICE_RE.test(service)) {
      return NextResponse.json({ error: "invalid 'service'" }, { status: 400 });
    }

    try {
      const snapshot = await getCapabilitySnapshot(service);
      if (!snapshot) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json(snapshot);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "failed to fetch capability" },
        { status: 500 },
      );
    }
  }),
);
