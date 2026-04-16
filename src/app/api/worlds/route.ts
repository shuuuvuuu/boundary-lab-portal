import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { detectPlatform } from "@/lib/worlds/detect-platform";
import { isPlatform } from "@/lib/worlds/platforms";
import {
  normalizeNullableText,
  normalizeTags,
  summarizeWorldRow,
} from "@/lib/worlds/registry";
import type { World, WorldReview, UserFavoriteWorld } from "@/types/worlds";

type WorldSelectRow = World & {
  user_favorite_worlds?: UserFavoriteWorld[] | null;
  world_reviews?: WorldReview[] | null;
};

const WORLD_SELECT = `
  id,
  platform,
  external_id,
  url,
  name,
  description,
  thumbnail_url,
  tags,
  added_by,
  created_at,
  updated_at,
  user_favorite_worlds(user_id, world_id, note, is_recommended, created_at),
  world_reviews(id, world_id, user_id, rating, body, created_at)
`;

export const GET = withRateLimit(
  { scope: "worlds:get", max: 90, windowMs: 60_000 },
  withAuth(async (request, { user, supabase }) => {
    const searchParams = request.nextUrl.searchParams;
    const recommendedOnly =
      searchParams.get("is_recommended") === "true" ||
      searchParams.get("recommended_only") === "true";
    const favorited = searchParams.get("favorited") === "true";
    const tag = searchParams.get("tag")?.trim().toLowerCase() ?? "";
    const platform = searchParams.get("platform")?.trim().toLowerCase() ?? "";

    let query = supabase
      .from("worlds")
      .select(WORLD_SELECT)
      .order("created_at", { ascending: false });

    if (platform) {
      if (!isPlatform(platform)) {
        return NextResponse.json({ error: "invalid platform" }, { status: 400 });
      }
      query = query.eq("platform", platform);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const worlds = ((data ?? []) as WorldSelectRow[]).map((row) =>
      summarizeWorldRow(row, user.id),
    );
    const filteredWorlds = worlds.filter((world) => {
      if (recommendedOnly && world.recommendation_count < 1) {
        return false;
      }

      if (favorited && !world.current_user_favorite) {
        return false;
      }

      if (tag && !world.tags.some((item) => item.toLowerCase().includes(tag))) {
        return false;
      }

      return true;
    });

    if (recommendedOnly) {
      filteredWorlds.sort((a, b) => {
        if (b.recommendation_count !== a.recommendation_count) {
          return b.recommendation_count - a.recommendation_count;
        }
        if ((b.average_rating ?? 0) !== (a.average_rating ?? 0)) {
          return (b.average_rating ?? 0) - (a.average_rating ?? 0);
        }
        return a.name.localeCompare(b.name, "ja");
      });
    }

    return NextResponse.json(filteredWorlds);
  }),
);

export const POST = withRateLimit(
  { scope: "worlds:post", max: 30, windowMs: 60_000 },
  withAuth(async (request, { user, supabase }) => {
    const body = (await request.json().catch(() => null)) as {
      url?: unknown;
      name?: unknown;
      description?: unknown;
      thumbnail_url?: unknown;
      tags?: unknown;
    } | null;

    const rawUrl = typeof body?.url === "string" ? body.url : "";
    const detected = detectPlatform(rawUrl);
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!detected || !name) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("worlds")
      .select(WORLD_SELECT)
      .eq("platform", detected.platform)
      .eq("external_id", detected.externalId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json(summarizeWorldRow(existing as WorldSelectRow, user.id));
    }

    const { data, error } = await supabase
      .from("worlds")
      .insert({
        platform: detected.platform,
        external_id: detected.externalId,
        url: detected.normalizedUrl,
        name,
        description: normalizeNullableText(body?.description),
        thumbnail_url: normalizeNullableText(body?.thumbnail_url),
        tags: normalizeTags(body?.tags),
        added_by: user.id,
      })
      .select(WORLD_SELECT)
      .single();

    if (error) {
      const status = error.code === "23505" ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(summarizeWorldRow(data as WorldSelectRow, user.id), {
      status: 201,
    });
  }),
);
