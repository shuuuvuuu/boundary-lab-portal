import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isGuestOpsEnabled, isOwnerEmail } from "./owner-email";

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

/**
 * Owner-or-guest 用 wrapper。
 *
 * 通常は owner email のみ通過させる。
 * ただし GUEST_OPS_ENABLED=true の時は未ログインでも通過し、
 * user は null で handler に渡る（read-only 観測ダッシュボード閲覧専用）。
 *
 * 認証済みでも owner でない一般ログインユーザーは、
 * GUEST_OPS_ENABLED=true の時のみ user 付きで通過する。
 * その場合も handler 内では owner 権限を要する操作は行わないこと。
 */
export type OwnerOrGuestContext = {
  user: User | null;
  isOwner: boolean;
  isGuest: boolean;
  supabase: SupabaseClient;
};

export type OwnerOrGuestHandler<P = Record<string, string>> = (
  request: NextRequest,
  ctx: OwnerOrGuestContext & { params?: Promise<P> },
) => Promise<NextResponse> | NextResponse;

export function withOwnerOrGuest<P = Record<string, string>>(
  handler: OwnerOrGuestHandler<P>,
) {
  return async (request: NextRequest, routeCtx: RouteCtx<P>) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const guestMode = isGuestOpsEnabled();
    const isOwner = isOwnerEmail(user?.email);

    // 未ログイン：ゲストモード時のみ通す、それ以外は 401
    if (!user) {
      if (!guestMode) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      return handler(request, {
        user: null,
        isOwner: false,
        isGuest: true,
        supabase,
        params: routeCtx?.params,
      });
    }

    // ログイン済みだが owner ではない：ゲストモード時のみ通す、それ以外は 403
    if (!isOwner) {
      if (!guestMode) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return handler(request, {
        user,
        isOwner: false,
        isGuest: true,
        supabase,
        params: routeCtx?.params,
      });
    }

    // owner
    return handler(request, {
      user,
      isOwner: true,
      isGuest: false,
      supabase,
      params: routeCtx?.params,
    });
  };
}
