import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

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

/**
 * pino 数値 level を IngestRow level 文字列に変換する。
 * pino 標準: 10=trace 20=debug 30=info 40=warn 50=error 60=fatal
 */
function pinoLevelToString(n: number): IngestRow["level"] {
  if (n < 30) return "debug"; // trace + debug を debug に統合
  if (n < 40) return "info";
  if (n < 50) return "warn";
  if (n < 60) return "error";
  return "fatal";
}

function normalize(raw: unknown): IngestRow | string {
  if (!raw || typeof raw !== "object") return "non-object record";
  const r = raw as Record<string, unknown>;

  // source: 明示 r.source 優先、なければ pino base field の r.service フォールバック
  // (rezona の baseLogger は { service: 'rezona-server', ... } を base field に持つ)
  let source = "";
  if (typeof r.source === "string") source = r.source.trim();
  if (!source && typeof r.service === "string") source = r.service.trim();
  if (!source) return "missing 'source' (or 'service')";
  if (source.length > 80) return "'source' too long";
  if (!/^[a-zA-Z0-9_:.-]+$/.test(source)) return "invalid 'source' chars";

  // level: 文字列 ("warn") も pino 数値 (40) も受け付ける
  let level: IngestRow["level"];
  if (typeof r.level === "string" && LEVELS.has(r.level)) {
    level = r.level as IngestRow["level"];
  } else if (typeof r.level === "number") {
    level = pinoLevelToString(r.level);
  } else {
    return "invalid 'level'";
  }

  // message: r.message 優先、なければ pino 標準の r.msg → r.event フォールバック
  let msgRaw: string | null = null;
  if (typeof r.message === "string" && r.message) msgRaw = r.message;
  else if (typeof r.msg === "string" && r.msg) msgRaw = r.msg;
  else if (typeof r.event === "string" && r.event) msgRaw = r.event;
  if (!msgRaw) return "missing 'message' (or 'msg' / 'event')";
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
    "server_id",
    "request_id",
    "trace_id",
    "user_id",
    "room_id",
    "release",
    "event",
    "route",
    "reason",
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
    level,
    message,
    context,
    occurred_at: occurredAt.toISOString(),
  };
}

async function handlePost(request: NextRequest) {
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

/**
 * Bearer token をキーに 60 req/min で制限する。
 * 認証なしリクエストは "anon" バケットに集約し、共通枠を奪い合う設計。
 * (実際は handlePost 側で 401 で弾くので "anon" 枠は早晩埋まる)
 */
export const POST = withRateLimit(
  {
    max: 60,
    windowMs: 60_000,
    scope: "logs-ingest",
    keyBy: (req) => req.headers.get("authorization") ?? "anon",
  },
  handlePost,
);

export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
