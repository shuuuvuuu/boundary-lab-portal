import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { normalizeNullableText } from "@/lib/worlds/registry";
import type { WorldReview } from "@/types/worlds";

export const POST = withRateLimit(
  { scope: "worlds:review:post", max: 45, windowMs: 60_000 },
  withAuth<{ id: string }>(async (request, { user, supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id } = await params;
    const body = (await request.json()) as {
      rating?: unknown;
      body?: unknown;
    };

    const rating =
      typeof body.rating === "number" && Number.isInteger(body.rating) ? body.rating : NaN;

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "invalid rating" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("world_reviews")
      .upsert(
        {
          world_id: id,
          user_id: user.id,
          rating,
          body: normalizeNullableText(body.body),
        },
        { onConflict: "world_id,user_id" },
      )
      .select("*")
      .single<WorldReview>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  }),
);
