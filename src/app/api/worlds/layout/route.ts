import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { buildWorldLayout } from "@/lib/worlds/layout";
import { fetchWorldSummaries } from "@/lib/worlds/fetch-world-summaries";

export const GET = withAuth(async (_request, { user, supabase }) => {
  try {
    const worlds = await fetchWorldSummaries({ supabase, userId: user.id });
    return NextResponse.json(buildWorldLayout(worlds));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to build layout" },
      { status: 500 },
    );
  }
});
