import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/app",
  "/onboarding",
  "/api/calendar",
  "/api/collections",
  "/api/worlds",
  "/api/hubs",
  "/api/admin",
];

function isProtected(pathname: string) {
  if (pathname.startsWith("/api/public/")) {
    return false;
  }

  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  if (!isProtected(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return response;
    }

    // haproxy 経由では nextUrl が内部 host (0.0.0.0:3000) を返す場合があるため、
    // NEXT_PUBLIC_SITE_URL (ビルド時焼き込み) を基準にする。未設定時は nextUrl fallback。
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const base = process.env.NEXT_PUBLIC_SITE_URL;

    // テストプレイ用: TEST_PLAY_AUTO_LOGIN_EMAIL が設定されていれば
    // 未ログイン訪問者を自動ログインルートに転送する。本番公開前に env を外すこと。
    const testLoginTarget =
      process.env.NODE_ENV !== "production" && process.env.TEST_PLAY_AUTO_LOGIN_EMAIL
      ? base
        ? new URL("/auth/test-login", base)
        : (() => {
            const u = request.nextUrl.clone();
            u.pathname = "/auth/test-login";
            return u;
          })()
      : null;
    if (testLoginTarget) {
      testLoginTarget.searchParams.set("next", next);
      return NextResponse.redirect(testLoginTarget);
    }

    const target = base
      ? new URL("/login", base)
      : (() => {
          const u = request.nextUrl.clone();
          u.pathname = "/login";
          return u;
        })();
    target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  }

  return response;
}
