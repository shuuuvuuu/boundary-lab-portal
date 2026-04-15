import { NextResponse } from "next/server";

// 外部依存ゼロのヘルスチェック。Supabase / Reticulum の障害で Pod が
// restart loop に陥らないよう、プロセスが動いていれば 200 を返す。
// 依存ヘルスは別途 /api/readyz（将来追加）で細かく見る想定。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
