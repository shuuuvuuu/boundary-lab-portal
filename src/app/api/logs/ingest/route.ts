import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/logs/ingest
 *
 * 外部サービス (rezona など) の pino ログを受信して service_logs に保存する。
 *
 * 認証:
 *   - Authorization: Bearer <PORTAL_LOG_INGEST_TOKEN>
 *   - 異なる外部サービスでも同じ token を共有する想定 (運用が単純)
 *
 * 入力フォーマット (JSON 1 件 or NDJSON 複数件):
 *   { source: "rezona-server", level: "warn", message: "...", context: {...}, occurred_at?: "..." }
 *
 * level は "debug" | "info" | "warn" | "error" | "fatal"。
 *
 * 制約:
 *   - 1 リクエスト最大 200 件 (レート制限・DB 守るため)
 *   - 1 件最大 16KB の JSON (pg_largeobject 化を避ける)
 *
 * **このルートは GUEST_OPS_BYPASS_PREFIXES にも追加すること**
 * (middleware で auth チェック対象から外す)。
 */

const MAX_RECORDS = 200;
const MAX_BYTES = 200 * 1024; // 200KB
const MAX_MESSAGE_LEN = 4_000;

type IngestRow = {
  source: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
  context: Record<string, unknown>;
  occurred_at: string;
};

const LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);

function normalize(raw: unknown): IngestRow | string {
  if (!raw || typeof raw !== "object") return "non-object record";
  const r = raw as Record<string, unknown>;
  const source = typeof r.source === "string" ? r.source.trim() : "";
  if (!source) return "missing 'source'";
  if (source.length > 80) return "'source' too long";
  if (!/^[a-zA-Z0-9_:.-]+$/.test(source)) return "invalid 'source' chars";

  const level = typeof r.level === "string" ? r.level : "";
  if (!LEVELS.has(level)) return "invalid 'level'";

  const msgRaw = typeof r.message === "string" ? r.message : null;
  if (!msgRaw) return "missing 'message'";
  const message = msgRaw.length > MAX_MESSAGE_LEN
    ? `${msgRaw.slice(0, MAX_MESSAGE_LEN)}…(truncated)`
    : msgRaw;

  let context: Record<string, unknown> = {};
  if (r.context && typeof r.context === "object" && !Array.isArray(r.context)) {
    context = r.context as Record<string, unknown>;
  }
  // メタフィールド (pid, hostname, trace_id 等) も context に保存しておくと後で便利
  for (const k of [
    "pid",
    "hostname",
    "service_id",
    "request_id",
    "trace_id",
    "user_id",
    "room_id",
    "release",
  ]) {
    if (r[k] !== undefined) {
      context[k] = r[k];
    }
  }

  let occurredAt = new Date();
  if (typeof r.occurred_at === "string") {
    const t = new Date(r.occurred_at);
    if (!Number.isNaN(t.getTime())) occurredAt = t;
  } else if (typeof r.time === "number") {
    // pino 標準は ms epoch
    const t = new Date(r.time);
    if (!Number.isNaN(t.getTime())) occurredAt = t;
  }

  return {
    source,
    level: level as IngestRow["level"],
    message,
    context,
    occurred_at: occurredAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const token = process.env.PORTAL_LOG_INGEST_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "ingest disabled (PORTAL_LOG_INGEST_TOKEN not configured)" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.slice("Bearer ".length).trim() !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let records: unknown[] = [];
  if (contentType.includes("application/x-ndjson") || contentType.includes("application/jsonl")) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        return NextResponse.json(
          { error: "invalid NDJSON line" },
          { status: 400 },
        );
      }
    }
  } else {
    try {
      const parsed = JSON.parse(text || "{}");
      if (Array.isArray(parsed)) records = parsed as unknown[];
      else records = [parsed];
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
  }

  if (records.length === 0) {
    return NextResponse.json({ inserted: 0 });
  }
  if (records.length > MAX_RECORDS) {
    return NextResponse.json(
      { error: `too many records (max ${MAX_RECORDS})` },
      { status: 413 },
    );
  }

  const rows: IngestRow[] = [];
  for (const rec of records) {
    const result = normalize(rec);
    if (typeof result === "string") {
      return NextResponse.json(
        { error: `invalid record: ${result}` },
        { status: 400 },
      );
    }
    rows.push(result);
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "supabase service role not configured" },
      { status: 500 },
    );
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.from("service_logs").insert(rows);
  if (error) {
    console.error("[logs-ingest] insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ inserted: rows.length });
}

export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
