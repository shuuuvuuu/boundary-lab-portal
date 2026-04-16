import { NextResponse } from "next/server";
import type { PlanTier } from "@/types/database";
import { notifyDiscord } from "@/lib/alerts/discord";
import { hasVerifiedEmailIdentity } from "./user-state";
import { withAuth, type AuthedHandler, type RouteCtx } from "./with-auth";

const TIER_RANK: Record<PlanTier, number> = {
  free: 0,
  standard: 1,
  professional: 2,
  enterprise: 3,
};

export function withTier<P = Record<string, string>>(
  minTier: PlanTier,
  handler: AuthedHandler<P>,
) {
  return withAuth<P>(async (request, ctx) => {
    if (!hasVerifiedEmailIdentity(ctx.user)) {
      return NextResponse.json({ error: "verified email required" }, { status: 403 });
    }

    const { data: profile, error } = await ctx.supabase
      .from("profiles")
      .select("plan_tier")
      .eq("id", ctx.user.id)
      .single<{ plan_tier: PlanTier }>();

    if (error || !profile) {
      // profile 行が無い = オンボーディング漏れ or DB 不整合。運用で検知したい。
      void notifyDiscord("error", "profile row missing for authenticated user", {
        user_id: ctx.user.id,
        email: ctx.user.email ?? "(unknown)",
      });
      return NextResponse.json({ error: "profile not found" }, { status: 500 });
    }

    if (TIER_RANK[profile.plan_tier] < TIER_RANK[minTier]) {
      return NextResponse.json({ error: "insufficient plan" }, { status: 403 });
    }

    return handler(request, ctx as typeof ctx & { params?: RouteCtx<P>["params"] });
  });
}
