import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/preview") ||
    pathname === "/api/healthz";

  if (!user && !isAuthRoute) {
    // haproxy 経由では nextUrl が内部 host (0.0.0.0:3000) を返す場合があるため、
    // NEXT_PUBLIC_SITE_URL (ビルド時焼き込み) を基準にする。未設定時は nextUrl fallback。
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const base = process.env.NEXT_PUBLIC_SITE_URL;
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
