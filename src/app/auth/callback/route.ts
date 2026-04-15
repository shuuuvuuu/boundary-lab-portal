import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // haproxy 経由では request.url が 0.0.0.0:3000 を返す場合があるため、
  // NEXT_PUBLIC_SITE_URL (ビルド時焼き込み) を優先する。
  const base = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin;

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=no_code`);
  }

  // クッキーを付与する先の response を先に作る。exchangeCodeForSession で
  // 設定される Set-Cookie は cookies().set() ではなく response.cookies に
  // 明示的に積まないと、NextResponse.redirect 経路ではブラウザに届かない。
  const response = NextResponse.redirect(`${base}${next}`);
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${base}/login?error=auth_callback_failed`);
  }

  return response;
}
