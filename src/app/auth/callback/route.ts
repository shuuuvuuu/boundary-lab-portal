import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { needsEmailOnboarding } from "@/lib/auth/user-state";
import type { Profile } from "@/types/database";

export async function GET(request: NextRequest) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  // haproxy 経由では request.url が 0.0.0.0:3000 を返す場合があるため、
  // NEXT_PUBLIC_SITE_URL (ビルド時焼き込み) を優先する。
  const base = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin;

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=no_code`);
  }

  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(nextCookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.push(...nextCookiesToSet);
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectWithCookies(cookiesToSet, `${base}/login?error=auth_callback_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithCookies(cookiesToSet, `${base}/login?error=auth_callback_failed`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "id" | "email">>();

  if (!profile) {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? null,
    });

    if (insertError) {
      return redirectWithCookies(cookiesToSet, `${base}/login?error=profile_sync_failed`);
    }
  } else if (user.email && profile.email !== user.email) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ email: user.email })
      .eq("id", user.id);

    if (updateError) {
      return redirectWithCookies(cookiesToSet, `${base}/login?error=profile_sync_failed`);
    }
  }

  const target = needsEmailOnboarding(user)
    ? `${base}/onboarding?next=${encodeURIComponent(next)}`
    : `${base}${next}`;

  return redirectWithCookies(cookiesToSet, target);
}

function sanitizeNext(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

function redirectWithCookies(
  cookiesToSet: { name: string; value: string; options: CookieOptions }[],
  target: string,
) {
  const response = NextResponse.redirect(target);

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
