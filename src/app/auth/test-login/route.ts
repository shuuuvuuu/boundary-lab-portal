import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// テストプレイ用: 未ログイン訪問者を TEST_PLAY_AUTO_LOGIN_EMAIL の magic link に
// 転送してそのアカウントでログインさせる。本番公開前に env を外すこと。
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const next = sanitizeNext(searchParams.get("next"));
  const base = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin;

  const testEmail = process.env.TEST_PLAY_AUTO_LOGIN_EMAIL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!testEmail || !serviceKey || !supabaseUrl) {
    return NextResponse.redirect(`${base}/login?error=test_mode_not_configured`);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: testEmail,
    options: {
      redirectTo: `${base}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data?.properties?.action_link) {
    const detail = encodeURIComponent(error?.message ?? "no action_link");
    return NextResponse.redirect(`${base}/login?error=test_login_failed&detail=${detail}`);
  }

  return NextResponse.redirect(data.properties.action_link);
}

function sanitizeNext(value: string | null): string {
  if (!value || !value.startsWith("/")) return "/";
  return value;
}
