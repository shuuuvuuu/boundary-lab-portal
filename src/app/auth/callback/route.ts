import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // haproxy 経由では request.url が内部アドレス (0.0.0.0:3000) を返す場合があり、
  // そこを基準にリダイレクトするとブラウザで到達不能になる。
  // NEXT_PUBLIC_SITE_URL (ビルド時に焼き込み) を優先し、未設定時のみ origin に fallback。
  const base = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${base}/login?error=auth_callback_failed`);
}
