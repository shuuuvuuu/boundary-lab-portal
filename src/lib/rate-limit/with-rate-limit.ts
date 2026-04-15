import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "./in-memory";

export type RateLimitOptions = {
  max: number;
  windowMs: number;
  /** Override the key derivation (default: client IP). */
  keyBy?: (request: NextRequest) => string;
  /** Label mixed into the key to scope buckets per route. */
  scope?: string;
};

const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const idx = Math.max(0, chain.length - TRUSTED_PROXY_HOPS);
    const candidate = chain[idx];
    if (candidate) return candidate;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

type RouteHandler = (request: NextRequest, ctx: never) => Promise<Response> | Response;

export function withRateLimit<H extends RouteHandler>(
  opts: RateLimitOptions,
  handler: H,
): H {
  const scope = opts.scope ?? "default";
  const wrapped = (async (request: NextRequest, ctx: never) => {
    const keySource = opts.keyBy ? opts.keyBy(request) : getClientIp(request);
    const key = `${scope}:${keySource}`;
    const result = checkRateLimit(key, opts.max, opts.windowMs);

    if (!result.ok) {
      const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(opts.max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(result.resetAt),
          },
        },
      );
    }

    const response = await handler(request, ctx);
    response.headers.set("X-RateLimit-Limit", String(opts.max));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(result.resetAt));
    return response;
  }) as H;

  return wrapped;
}
