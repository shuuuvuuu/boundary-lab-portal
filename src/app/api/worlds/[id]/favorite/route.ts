import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { normalizeNullableText } from "@/lib/worlds/registry";
import type { UserFavoriteWorld } from "@/types/worlds";

export const POST = withRateLimit(
  { scope: "worlds:favorite:post", max: 60, windowMs: 60_000 },
  withAuth<{ id: string }>(async (request, { user, supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id } = await params;
    const body = (await request.json()) as {
      note?: unknown;
      is_recommended?: unknown;
    };

    const { data, error } = await supabase
      .from("user_favorite_worlds")
      .upsert(
        {
          user_id: user.id,
          world_id: id,
          note: normalizeNullableText(body.note),
          is_recommended: body.is_recommended === true,
        },
        { onConflict: "user_id,world_id" },
      )
      .select("*")
      .single<UserFavoriteWorld>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  }),
);

export const DELETE = withRateLimit(
  { scope: "worlds:favorite:delete", max: 60, windowMs: 60_000 },
  withAuth<{ id: string }>(async (_request, { user, supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id } = await params;
    const { error } = await supabase
      .from("user_favorite_worlds")
      .delete()
      .eq("user_id", user.id)
      .eq("world_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }),
);
