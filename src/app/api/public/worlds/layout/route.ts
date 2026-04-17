import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { buildWorldLayout } from "@/lib/worlds/layout";
import { fetchPublicWorlds } from "@/lib/worlds/fetch-public-worlds";

export const GET = withRateLimit(
  { scope: "public:worlds:layout", max: 60, windowMs: 60_000 },
  async () => {
    try {
      const worlds = await fetchPublicWorlds();
      return NextResponse.json(buildWorldLayout(worlds));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "failed to build public layout" },
        { status: 500 },
      );
    }
  },
);
