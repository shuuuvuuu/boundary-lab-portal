import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import { attachSentryLinks } from "@/lib/sentry/links";

/**
 * GET /api/admin/activity
 *
 * Phase 2.2 Activity タブ用。
 * Supabase `activity_events` テーブルから時系列で検索する。
 *
 * クエリ:
 *   - service      : boundary | rezona (複数は `,` 区切り、省略時は全て)
 *   - event_type   : user_action | api_request | server_event (省略時は全て)
 *   - user_id      : 特定ユーザー絞り込み (完全一致)
 *   - statsPeriod  : 1h | 24h | 7d (default 24h)
 *   - limit        : 1〜500 (default 200)
 *   - action       : 完全一致または前方一致 (`GET%` など wildcard 許容)
 *
 * 集計サマリ:
 *   - user_actions_top : user_id 別の直近 count 上位
 *   - api_top          : action (method + path) 別の count 上位
 */

type ActivityRow = {
  id: string;
  service: string;
  event_type: "user_action" | "api_request" | "server_event";
  action: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parsePeriod(url: URL): { label: string; sinceIso: string } {
  const raw = url.searchParams.get("statsPeriod") ?? "24h";
  const ms =
    raw === "1h" ? 3600_000 : raw === "7d" ? 7 * 86400_000 : 24 * 3600_000;
  const label = raw === "1h" ? "1h" : raw === "7d" ? "7d" : "24h";
  const sinceIso = new Date(Date.now() - ms).toISOString();
  return { label, sinceIso };
}

function parseServices(url: URL): string[] | null {
  const raw = url.searchParams.get("service");
  if (!raw) return null; // null = 全 service
  const arr = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s === "boundary" || s === "rezona");
  return arr.length > 0 ? arr : null;
}

function parseEventType(url: URL): ActivityRow["event_type"] | null {
  const raw = url.searchParams.get("event_type");
  if (raw === "user_action" || raw === "api_request" || raw === "server_event") return raw;
  return null;
}

function parseLimit(url: URL): number {
  const raw = Number(url.searchParams.get("limit") ?? "200");
  if (!Number.isFinite(raw) || raw <= 0) return 200;
  return Math.min(500, Math.max(1, Math.floor(raw)));
}

export const GET = withRateLimit(
  { max: 15, windowMs: 60_000, scope: "admin-activity" },
  withOwnerOrGuest(async (request) => {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 },
      );
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const url = new URL(request.url);
    const period = parsePeriod(url);
    const services = parseServices(url);
    const eventType = parseEventType(url);
    const userId = url.searchParams.get("user_id");
    const actionFilter = url.searchParams.get("action");
    const limit = parseLimit(url);

    let q = supabase
      .from("activity_events")
      .select("*")
      .gte("occurred_at", period.sinceIso)
      .order("occurred_at", { ascending: false })
      .limit(limit);

    if (services) q = q.in("service", services);
    if (eventType) q = q.eq("event_type", eventType);
    if (userId) q = q.eq("user_id", userId);
    if (actionFilter) {
      if (actionFilter.endsWith("%")) q = q.like("action", actionFilter);
      else q = q.eq("action", actionFilter);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as ActivityRow[];
    const rowsWithLinks = await attachSentryLinks(rows);

    // 集計サマリ（期間内全件ベースではなく、取得した limit 件数ベース）
    const userCount = new Map<string, number>();
    const apiCount = new Map<string, number>();
    for (const r of rows) {
      if (r.event_type === "user_action" && r.user_id) {
        userCount.set(r.user_id, (userCount.get(r.user_id) ?? 0) + 1);
      }
      if (r.event_type === "api_request") {
        apiCount.set(r.action, (apiCount.get(r.action) ?? 0) + 1);
      }
    }
    const topUsers = Array.from(userCount.entries())
      .map(([user_id, count]) => ({ user_id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topApis = Array.from(apiCount.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      events: rowsWithLinks,
      total: rows.length,
      statsPeriod: period.label,
      services,
      eventType,
      userId,
      topUsers,
      topApis,
    });
  }),
);
