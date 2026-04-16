import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { detectPlatform } from "@/lib/worlds/detect-platform";
import { normalizeNullableText, normalizeTags } from "@/lib/worlds/registry";
import type { World } from "@/types/worlds";

export const PATCH = withRateLimit(
  { scope: "worlds:patch", max: 30, windowMs: 60_000 },
  withAuth<{ id: string }>(async (request, { user, supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id } = await params;
    const body = (await request.json()) as {
      url?: unknown;
      name?: unknown;
      description?: unknown;
      thumbnail_url?: unknown;
      tags?: unknown;
    };

    const { data: existing, error: existingError } = await supabase
      .from("worlds")
      .select("*")
      .eq("id", id)
      .eq("added_by", user.id)
      .maybeSingle<World>();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const nextUrl = typeof body.url === "string" && body.url.trim() ? body.url : existing.url;
    const detected = detectPlatform(nextUrl);
    const nextName =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name;

    if (!detected || !nextName) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("worlds")
      .update({
        platform: detected.platform,
        external_id: detected.externalId,
        url: detected.normalizedUrl,
        name: nextName,
        description:
          body.description === undefined
            ? existing.description
            : normalizeNullableText(body.description),
        thumbnail_url:
          body.thumbnail_url === undefined
            ? existing.thumbnail_url
            : normalizeNullableText(body.thumbnail_url),
        tags: body.tags === undefined ? existing.tags : normalizeTags(body.tags),
      })
      .eq("id", id)
      .eq("added_by", user.id)
      .select("*")
      .single<World>();

    if (error) {
      const status = error.code === "23505" ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(data);
  }),
);

export const DELETE = withRateLimit(
  { scope: "worlds:delete", max: 30, windowMs: 60_000 },
  withAuth<{ id: string }>(async (_request, { supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id } = await params;
    const { data, error } = await supabase
      .from("worlds")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  }),
);
