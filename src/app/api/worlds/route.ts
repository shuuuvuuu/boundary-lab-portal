import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { detectPlatform } from "@/lib/worlds/detect-platform";
import { enrichWorldSummaries, fetchWorldSummaries } from "@/lib/worlds/fetch-world-summaries";
import { isPlatform } from "@/lib/worlds/platforms";
import {
  normalizeNullableText,
  normalizeTags,
} from "@/lib/worlds/registry";
import { WORLD_SELECT, type WorldSelectRow } from "@/lib/worlds/select";
import type { WorldSummary } from "@/types/worlds";

type SortKey = "recent" | "most_active" | "last_visited";

function compareLastVisited(left: WorldSummary, right: WorldSummary) {
  const leftTime = left.current_user_last_visited_at
    ? new Date(left.current_user_last_visited_at).getTime()
    : Number.NEGATIVE_INFINITY;
  const rightTime = right.current_user_last_visited_at
    ? new Date(right.current_user_last_visited_at).getTime()
    : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime;
}

function sortWorlds(worlds: WorldSummary[], sort: SortKey | null, recommendedOnly: boolean) {
  const nextWorlds = [...worlds];

  if (sort === "recent") {
    return nextWorlds.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  if (sort === "most_active") {
    return nextWorlds.sort(
      (a, b) =>
        b.active_user_count - a.active_user_count ||
        b.recommendation_count - a.recommendation_count ||
        (b.average_rating ?? 0) - (a.average_rating ?? 0) ||
        a.name.localeCompare(b.name, "ja"),
    );
  }

  if (sort === "last_visited") {
    return nextWorlds.sort(
      (a, b) =>
        compareLastVisited(a, b) ||
        b.active_user_count - a.active_user_count ||
        a.name.localeCompare(b.name, "ja"),
    );
  }

  if (recommendedOnly) {
    return nextWorlds.sort((a, b) => {
      if (b.recommendation_count !== a.recommendation_count) {
        return b.recommendation_count - a.recommendation_count;
      }
      if ((b.average_rating ?? 0) !== (a.average_rating ?? 0)) {
        return (b.average_rating ?? 0) - (a.average_rating ?? 0);
      }
      return a.name.localeCompare(b.name, "ja");
    });
  }

  return nextWorlds;
}

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
    const sortParam = searchParams.get("sort");
    const limitParam = Number(searchParams.get("limit") ?? "");
    const sort: SortKey | null =
      sortParam === "recent" || sortParam === "most_active" || sortParam === "last_visited"
        ? sortParam
        : null;

    if (platform) {
      if (!isPlatform(platform)) {
        return NextResponse.json({ error: "invalid platform" }, { status: 400 });
      }
    }

    let worlds: WorldSummary[];
    try {
      worlds = await fetchWorldSummaries({
        supabase,
        userId: user.id,
        platform: platform && isPlatform(platform) ? platform : undefined,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "failed to load worlds" },
        { status: 500 },
      );
    }

    const filteredWorlds = worlds.filter((world) => {
      if (recommendedOnly) {
        const isPublic = world.recommendation_count >= 1;
        const isOwn = world.added_by === user.id;
        if (!isPublic && !isOwn) {
          return false;
        }
      }

      if (favorited && !world.current_user_favorite) {
        return false;
      }

      if (tag && !world.tags.some((item) => item.toLowerCase().includes(tag))) {
        return false;
      }

      return true;
    });

    const sortedWorlds = sortWorlds(filteredWorlds, sort, recommendedOnly);
    const limitedWorlds =
      Number.isFinite(limitParam) && limitParam > 0
        ? sortedWorlds.slice(0, Math.min(limitParam, 100))
        : sortedWorlds;

    return NextResponse.json(limitedWorlds);
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
      const [summary] = await enrichWorldSummaries(supabase, user.id, [existing as WorldSelectRow]);
      return NextResponse.json(summary);
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

    const [summary] = await enrichWorldSummaries(supabase, user.id, [data as WorldSelectRow]);
    return NextResponse.json(summary, {
      status: 201,
    });
  }),
);
