import { NextResponse } from "next/server";
import type { PlanTier } from "@/types/database";
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
    const { data: profile, error } = await ctx.supabase
      .from("profiles")
      .select("plan_tier")
      .eq("id", ctx.user.id)
      .single<{ plan_tier: PlanTier }>();

    if (error || !profile) {
      return NextResponse.json({ error: "profile not found" }, { status: 403 });
    }

    if (TIER_RANK[profile.plan_tier] < TIER_RANK[minTier]) {
      return NextResponse.json({ error: "insufficient plan" }, { status: 403 });
    }

    return handler(request, ctx as typeof ctx & { params?: RouteCtx<P>["params"] });
  });
}
