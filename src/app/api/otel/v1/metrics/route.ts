import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { unwrapResourceMetrics } from "@/lib/otel-ingest";

const INSERT_CHUNK_SIZE = 1_000;

function isAuthorized(req: NextRequest) {
  const token = process.env.OTEL_INGEST_TOKEN;
  const auth = req.headers.get("authorization");
  return Boolean(token) && auth === `Bearer ${token}`;
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const rows = unwrapResourceMetrics(
    Array.isArray(body?.resourceMetrics) ? body.resourceMetrics : [],
  );
  if (rows.length === 0) {
    return new Response("ok", { status: 200 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("[otel.ingest.metrics.config] supabase service role not configured");
    return new Response("db error", { status: 500 });
  }

  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const { error } = await supabase
      .from("otel_metrics")
      .insert(rows.slice(i, i + INSERT_CHUNK_SIZE));
    if (error) {
      console.error("[otel.ingest.metrics.fail]", error.message);
      return new Response("db error", { status: 500 });
    }
  }

  return new Response("ok", { status: 200 });
}
