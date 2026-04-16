import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { getCurrentProfile } from "@/lib/profiles/current-profile";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

type CollectionOwnerRow = {
  owner_id: string;
};

async function canManageCollection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  collectionId: string,
) {
  const [profile, existingResult] = await Promise.all([
    getCurrentProfile(supabase).catch(() => null),
    supabase.from("collections").select("owner_id").eq("id", collectionId).maybeSingle(),
  ]);

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existing = (existingResult.data as CollectionOwnerRow | null) ?? null;
  if (!existing) {
    return { exists: false, allowed: false };
  }

  return {
    exists: true,
    allowed: existing.owner_id === userId || profile?.plan_tier === "enterprise",
  };
}

export const POST = withRateLimit(
  { scope: "collections:worlds:post", max: 30, windowMs: 60_000 },
  withAuth<{ id: string; worldId: string }>(async (_request, { user, supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id, worldId } = await params;
    const permission = await canManageCollection(supabase, user.id, id);
    if (!permission.exists) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (!permission.allowed) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("collection_worlds").upsert(
      {
        collection_id: id,
        world_id: worldId,
      },
      { onConflict: "collection_id,world_id", ignoreDuplicates: true },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }),
);

export const DELETE = withRateLimit(
  { scope: "collections:worlds:delete", max: 30, windowMs: 60_000 },
  withAuth<{ id: string; worldId: string }>(async (_request, { user, supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id, worldId } = await params;
    const permission = await canManageCollection(supabase, user.id, id);
    if (!permission.exists) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (!permission.allowed) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("collection_worlds")
      .delete()
      .eq("collection_id", id)
      .eq("world_id", worldId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }),
);
