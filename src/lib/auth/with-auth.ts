import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type AuthContext = {
  user: User;
  supabase: SupabaseClient;
};

export type RouteCtx<P = Record<string, string>> = {
  params: Promise<P>;
};

export type AuthedHandler<P = Record<string, string>> = (
  request: NextRequest,
  ctx: AuthContext & { params?: Promise<P> },
) => Promise<NextResponse> | NextResponse;

export function withAuth<P = Record<string, string>>(handler: AuthedHandler<P>) {
  return async (request: NextRequest, routeCtx: RouteCtx<P>) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    return handler(request, {
      user,
      supabase,
      params: routeCtx?.params,
    });
  };
}
