import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { normalizeWorldReviewRow, type WorldReviewRow } from "@/lib/worlds/registry";

export const GET = withRateLimit(
  { scope: "worlds:reviews:get", max: 90, windowMs: 60_000 },
  withAuth<{ id: string }>(async (_request, { supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id } = await params;
    const { data, error } = await supabase
      .from("world_reviews")
      .select(
        `
          id,
          world_id,
          user_id,
          rating,
          body,
          created_at,
          profile:profiles!world_reviews_user_id_fkey(display_name, avatar_url)
        `,
      )
      .eq("world_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(((data ?? []) as WorldReviewRow[]).map(normalizeWorldReviewRow));
  }),
);
