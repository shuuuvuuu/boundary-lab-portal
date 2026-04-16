import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { getPublicProfileMap } from "@/lib/profiles/public-profiles";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import type { CalendarEventSummary, NewCalendarEvent } from "@/types/database";

type CalendarEventRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  world_id: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  world:
    | {
        id: string;
        name: string;
        url: string;
        platform: "hubs" | "vrchat" | "spatial" | "other";
        thumbnail_url: string | null;
      }
    | {
        id: string;
        name: string;
        url: string;
        platform: "hubs" | "vrchat" | "spatial" | "other";
        thumbnail_url: string | null;
      }[]
    | null;
};

function normalizeWorld(value: CalendarEventRow["world"]): CalendarEventSummary["world"] {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

async function serializeCalendarEvents(
  rows: CalendarEventRow[],
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<CalendarEventSummary[]> {
  const profileMap = await getPublicProfileMap(
    supabase,
    rows.map((row) => row.user_id),
  );

  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    world_id: row.world_id,
    is_public: row.is_public,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_own: row.user_id === userId,
    owner_profile: profileMap.get(row.user_id) ?? null,
    world: normalizeWorld(row.world),
  }));
}

export const GET = withRateLimit(
  { scope: "calendar:get", max: 60, windowMs: 60_000 },
  withAuth(async (request, { user, supabase }) => {
    const scope = request.nextUrl.searchParams.get("scope") === "visible" ? "visible" : "mine";

    let query = supabase
      .from("calendar_events")
      .select(`
        id,
        user_id,
        title,
        description,
        starts_at,
        ends_at,
        world_id,
        is_public,
        created_at,
        updated_at,
        world:worlds(id, name, url, platform, thumbnail_url)
      `)
      .order("starts_at", { ascending: true });

    if (scope === "mine") {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(await serializeCalendarEvents((data ?? []) as CalendarEventRow[], user.id, supabase));
  }),
);

export const POST = withRateLimit(
  { scope: "calendar:post", max: 30, windowMs: 60_000 },
  withAuth(async (request, { user, supabase }) => {
    const body = (await request.json()) as NewCalendarEvent;
    if (!body.title || !body.starts_at || !body.ends_at) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("calendar_events")
      .insert({
        ...body,
        user_id: user.id,
        world_id: body.world_id ?? null,
        is_public: body.is_public ?? false,
      })
      .select(`
        id,
        user_id,
        title,
        description,
        starts_at,
        ends_at,
        world_id,
        is_public,
        created_at,
        updated_at,
        world:worlds(id, name, url, platform, thumbnail_url)
      `)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const [summary] = await serializeCalendarEvents([data as CalendarEventRow], user.id, supabase);
    return NextResponse.json(summary, { status: 201 });
  }),
);
