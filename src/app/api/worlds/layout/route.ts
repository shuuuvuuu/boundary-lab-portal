import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { buildWorldLayout } from "@/lib/worlds/layout";
import { summarizeWorldRow } from "@/lib/worlds/registry";
import { WORLD_SELECT, type WorldSelectRow } from "@/lib/worlds/select";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const { data, error } = await supabase
    .from("worlds")
    .select(WORLD_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const worlds = ((data ?? []) as WorldSelectRow[]).map((row) => summarizeWorldRow(row, user.id));
  return NextResponse.json(buildWorldLayout(worlds));
});
