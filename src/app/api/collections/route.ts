import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { getPublicProfileMap } from "@/lib/profiles/public-profiles";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import type { CollectionSummary, CollectionWorldOption, NewCollectionPayload } from "@/types/collections";

type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  collection_worlds?:
    | Array<{
        world: CollectionWorldOption | CollectionWorldOption[] | null;
      }>
    | null;
};

function normalizeWorldOptions(row: CollectionRow): CollectionWorldOption[] {
  return (row.collection_worlds ?? [])
    .map((item) => (Array.isArray(item.world) ? (item.world[0] ?? null) : item.world ?? null))
    .filter((world): world is CollectionWorldOption => Boolean(world));
}

async function serializeCollections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: CollectionRow[],
  userId: string,
): Promise<CollectionSummary[]> {
  const profileMap = await getPublicProfileMap(
    supabase,
    rows.map((row) => row.owner_id),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    owner_id: row.owner_id,
    owner_profile: profileMap.get(row.owner_id) ?? null,
    is_public: row.is_public,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_owner: row.owner_id === userId,
    worlds: normalizeWorldOptions(row),
  }));
}

export const GET = withRateLimit(
  { scope: "collections:get", max: 90, windowMs: 60_000 },
  withAuth(async (request, { user, supabase }) => {
    const scope = request.nextUrl.searchParams.get("scope") === "mine" ? "mine" : "visible";

    let query = supabase
      .from("collections")
      .select(`
        id,
        name,
        description,
        owner_id,
        is_public,
        created_at,
        updated_at,
        collection_worlds(
          world:worlds(id, name, platform, thumbnail_url)
        )
      `)
      .order("created_at", { ascending: false });

    if (scope === "mine") {
      query = query.eq("owner_id", user.id);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(await serializeCollections(supabase, (data ?? []) as CollectionRow[], user.id));
  }),
);

export const POST = withRateLimit(
  { scope: "collections:post", max: 30, windowMs: 60_000 },
  withAuth(async (request, { user, supabase }) => {
    const body = (await request.json().catch(() => null)) as NewCollectionPayload | null;
    const name = body?.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("collections")
      .insert({
        name,
        description: body?.description?.trim() || null,
        owner_id: user.id,
        is_public: body?.is_public ?? true,
      })
      .select(`
        id,
        name,
        description,
        owner_id,
        is_public,
        created_at,
        updated_at,
        collection_worlds(
          world:worlds(id, name, platform, thumbnail_url)
        )
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const [summary] = await serializeCollections(supabase, [data as CollectionRow], user.id);
    return NextResponse.json(summary, { status: 201 });
  }),
);
