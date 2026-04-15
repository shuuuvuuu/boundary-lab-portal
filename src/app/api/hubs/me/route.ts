import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { isReticulumDbConfigured, lookupAccountByEmail } from "@/lib/hubs/db";
import { notifyDiscord } from "@/lib/alerts/discord";

function classifyPgError(err: { code?: string; message?: string }): string {
  const code = err.code ?? "";
  if (code === "42P01" || code === "42703") return "schema_mismatch"; // テーブル/カラム不在
  if (code.startsWith("08")) return "connection"; // 接続系
  if (code === "57014") return "timeout"; // statement_timeout
  if (/timeout/i.test(err.message ?? "")) return "timeout";
  return "unknown";
}

export const GET = withRateLimit(
  { scope: "hubs:me", max: 30, windowMs: 60_000 },
  withAuth(async (_request, { user, supabase }) => {
    if (!isReticulumDbConfigured()) {
      return NextResponse.json(
        { configured: false, account: null, message: "Reticulum DB 未設定" },
        { status: 200 },
      );
    }

    const email = user.email;
    if (!email) {
      return NextResponse.json(
        { configured: true, account: null, message: "Supabase user email missing" },
        { status: 200 },
      );
    }

    let account;
    try {
      account = await lookupAccountByEmail(email);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      const kind = classifyPgError(e);
      // email や pg err.detail / err.where は PII を含み得るため Discord には送らない
      void notifyDiscord("error", "Reticulum DB lookup failed", {
        user_id: user.id,
        kind,
        code: e.code ?? "unknown",
      });
      return NextResponse.json(
        { configured: true, account: null, message: "Hubs lookup failed" },
        { status: 502 },
      );
    }

    if (!account) {
      return NextResponse.json(
        { configured: true, account: null, message: "Hubs アカウント未登録" },
        { status: 200 },
      );
    }

    // profiles.hubs_account_id をキャッシュ（初回のみ書き込み）
    await supabase
      .from("profiles")
      .update({ hubs_account_id: String(account.account_id) })
      .eq("id", user.id)
      .is("hubs_account_id", null);

    return NextResponse.json({ configured: true, account });
  }),
);
