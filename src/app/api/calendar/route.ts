import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import type { NewCalendarEvent } from "@/types/database";

export const GET = withRateLimit(
  { scope: "calendar:get", max: 60, windowMs: 60_000 },
  withAuth(async (_request, { user, supabase }) => {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .order("starts_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
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
      .insert({ ...body, user_id: user.id })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }),
);
