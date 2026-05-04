import { NextResponse, type NextRequest } from "next/server";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withAuth, type RouteCtx } from "@/lib/auth/with-auth";
import {
  type CapabilitySnapshot,
  type CapabilityState,
  getCapabilityIngestToken,
  upsertCapabilitySnapshot,
} from "@/lib/capability/store";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

const SERVICE_RE = /^[a-zA-Z0-9_:.-]+$/;
const CAPABILITY_RE = /^[a-zA-Z0-9_.:-]+$/;
const STATES = new Set<CapabilityState>(["green", "yellow", "red"]);

function hasInternalAuth(request: NextRequest): boolean {
  const secret = getCapabilityIngestToken();
  const auth = request.headers.get("authorization") ?? "";
  return Boolean(secret) && auth === `Bearer ${secret}`;
}

async function parseSnapshot(request: NextRequest): Promise<CapabilitySnapshot | NextResponse> {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const service = typeof record.service === "string" ? record.service.trim() : "";
  const lastSeenAt = typeof record.last_seen_at === "string" ? record.last_seen_at : "";
  const capabilitiesRaw = record.capabilities;

  if (!service || service.length > 80 || !SERVICE_RE.test(service)) {
    return NextResponse.json({ error: "invalid 'service'" }, { status: 400 });
  }
  if (!lastSeenAt || Number.isNaN(Date.parse(lastSeenAt))) {
    return NextResponse.json({ error: "invalid 'last_seen_at'" }, { status: 400 });
  }
  if (
    !capabilitiesRaw ||
    typeof capabilitiesRaw !== "object" ||
    Array.isArray(capabilitiesRaw)
  ) {
    return NextResponse.json({ error: "invalid 'capabilities'" }, { status: 400 });
  }

  const capabilities: Record<string, CapabilityState> = {};
  for (const [key, value] of Object.entries(capabilitiesRaw)) {
    if (!key || key.length > 80 || !CAPABILITY_RE.test(key)) {
      return NextResponse.json({ error: "invalid capability key" }, { status: 400 });
    }
    if (!STATES.has(value as CapabilityState)) {
      return NextResponse.json({ error: "invalid capability state" }, { status: 400 });
    }
    capabilities[key] = value as CapabilityState;
  }

  return {
    service,
    last_seen_at: new Date(lastSeenAt).toISOString(),
    capabilities,
  };
}

async function ingest(request: NextRequest) {
  const snapshot = await parseSnapshot(request);
  if (snapshot instanceof NextResponse) return snapshot;

  try {
    await upsertCapabilitySnapshot(snapshot);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upsert failed" },
      { status: 500 },
    );
  }
}

const ownerPost = withAuth(async (request, ctx) => {
  if (!isOwnerEmail(ctx.user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return ingest(request);
});

async function handlePost(request: NextRequest, ctx: RouteCtx) {
  if (hasInternalAuth(request)) return ingest(request);
  return ownerPost(request, ctx);
}

export const POST = withRateLimit(
  {
    max: 60,
    windowMs: 60_000,
    scope: "admin-capability-ingest",
    keyBy: (request) => request.headers.get("authorization") ?? "anon",
  },
  handlePost,
);
