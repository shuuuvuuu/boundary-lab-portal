import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { getCurrentProfile } from "@/lib/profiles/current-profile";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

type CollectionOwnerRow = {
  owner_id: string;
};

export const PATCH = withRateLimit(
  { scope: "collections:patch", max: 30, windowMs: 60_000 },
  withAuth<{ id: string }>(async (request, { user, supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      description?: unknown;
      is_public?: unknown;
    } | null;

    const { data: existing, error: existingError } = await supabase
      .from("collections")
      .select("owner_id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if ((existing as CollectionOwnerRow).owner_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("collections")
      .update({
        name,
        description:
          typeof body?.description === "string" ? body.description.trim() || null : null,
        is_public: typeof body?.is_public === "boolean" ? body.is_public : true,
      })
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }),
);

export const DELETE = withRateLimit(
  { scope: "collections:delete", max: 30, windowMs: 60_000 },
  withAuth<{ id: string }>(async (_request, { user, supabase, params }) => {
    if (!params) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const { id } = await params;
    const profile = await getCurrentProfile(supabase).catch(() => null);
    const isAdmin = profile?.plan_tier === "enterprise";

    const { data: existing, error: existingError } = await supabase
      .from("collections")
      .select("owner_id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if ((existing as CollectionOwnerRow).owner_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("collections").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }),
);
