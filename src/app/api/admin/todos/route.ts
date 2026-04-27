import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, withOwnerOrGuest } from "@/lib/auth/with-auth";
import { isOwnerEmail } from "@/lib/auth/owner-email";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

/**
 * /api/admin/todos
 *   GET:  TODO 一覧 (status / due_at で絞り込み)
 *   POST: TODO 追加 (owner のみ)
 *   PATCH: TODO 更新 (owner のみ)
 *
 * todo-notify ジョブが期限間近を Discord 通知。
 */

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-todos-list" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "open";
    if (!["open", "done", "cancelled", "all"].includes(status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: "supabase not configured" },
        { status: 500 },
      );
    }
    let q = supabase
      .from("ops_todos")
      .select("id, title, notes, due_at, status, priority, created_at, updated_at")
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      // テーブル未作成時は空配列で返す (migration 未適用時の DX)
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        return NextResponse.json({ todos: [], note: "ops_todos テーブル未作成" });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ todos: data ?? [] });
  }),
);

export const POST = withRateLimit(
  { max: 10, windowMs: 60_000, scope: "admin-todos-create" },
  withAuth(async (request, ctx) => {
    if (!isOwnerEmail(ctx.user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    let body: { title?: string; notes?: string; due_at?: string; priority?: number };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    const title = (body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "missing 'title'" }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ error: "title too long" }, { status: 400 });

    const due_at = body.due_at ? new Date(body.due_at) : null;
    if (due_at && Number.isNaN(due_at.getTime())) {
      return NextResponse.json({ error: "invalid due_at" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
    }
    const { data, error } = await supabase
      .from("ops_todos")
      .insert({
        title,
        notes: body.notes ?? null,
        due_at: due_at ? due_at.toISOString() : null,
        priority: typeof body.priority === "number" ? body.priority : 0,
      })
      .select("id, title, notes, due_at, status, priority, created_at, updated_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ todo: data });
  }),
);

export const PATCH = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-todos-update" },
  withAuth(async (request, ctx) => {
    if (!isOwnerEmail(ctx.user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    let body: { id?: string; status?: string; title?: string; notes?: string; due_at?: string | null; priority?: number };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "missing 'id'" }, { status: 400 });
    }
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) {
      if (!["open", "done", "cancelled"].includes(body.status)) {
        return NextResponse.json({ error: "invalid status" }, { status: 400 });
      }
      update.status = body.status;
    }
    if (body.title !== undefined) update.title = body.title;
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.due_at !== undefined) update.due_at = body.due_at;
    if (body.priority !== undefined) update.priority = body.priority;

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
    }
    const { data, error } = await supabase
      .from("ops_todos")
      .update(update)
      .eq("id", body.id)
      .select("id, title, notes, due_at, status, priority, created_at, updated_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ todo: data });
  }),
);
