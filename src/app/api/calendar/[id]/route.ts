import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

export const DELETE = withRateLimit(
  { scope: "calendar:delete", max: 30, windowMs: 60_000 },
  withAuth<{ id: string }>(async (_request, { user, supabase, params }) => {
    if (!params) return NextResponse.json({ error: "bad request" }, { status: 400 });
    const { id } = await params;

    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }),
);
