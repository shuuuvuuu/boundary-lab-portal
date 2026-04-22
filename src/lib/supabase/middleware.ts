import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/app",
  "/admin",
  "/onboarding",
  "/api/calendar",
  "/api/collections",
  "/api/worlds",
  "/api/hubs",
  "/api/admin",
];

const CLOSED_MODE_BYPASS_PATHS = ["/coming-soon", "/login", "/api/healthz"];
const CLOSED_MODE_BYPASS_PREFIXES = ["/auth/"];
const STATIC_ASSET_PATTERN =
  /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2|ttf|otf)$/i;

function isProtected(pathname: string) {
  if (pathname.startsWith("/api/public/")) {
    return false;
  }

  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isPortalClosed() {
  return process.env.PORTAL_CLOSED === "true";
}

function isClosedModeBypassPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    STATIC_ASSET_PATTERN.test(pathname) ||
    CLOSED_MODE_BYPASS_PATHS.includes(pathname) ||
    CLOSED_MODE_BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function createPublicApiClosedResponse() {
  return NextResponse.json(
    { error: "portal closed for public preview" },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "3600",
      },
    },
  );
}

function createRedirectUrl(request: NextRequest, pathname: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL;

  if (base) {
    return new URL(pathname, base);
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return url;
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const closed = isPortalClosed();

  if (closed && pathname.startsWith("/api/public/")) {
    return createPublicApiClosedResponse();
  }

  if (!closed && !isProtected(pathname)) {
    return NextResponse.next({ request });
  }

  if (closed && isClosedModeBypassPath(pathname)) {
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

  if (closed) {
    if (!user) {
      return NextResponse.redirect(createRedirectUrl(request, "/coming-soon"));
    }

    // /admin と /api/admin はクローズモードでもオーナーだけ通過。
    // 実際の owner email チェックは layout.tsx / route handler 側で実施。
    if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
      return response;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_tier")
      .eq("id", user.id)
      .maybeSingle<{ plan_tier: string | null }>();

    if (profile?.plan_tier === "enterprise") {
      return response;
    }

    return NextResponse.redirect(createRedirectUrl(request, "/coming-soon"));
  }

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
