import { NextResponse } from "next/server";

import {
  boundedInt,
  getSupabaseAdmin,
  isSafeFilterValue,
  parseAdminOtelPeriod,
} from "@/lib/admin-otel";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";

export const GET = withRateLimit(
  { max: 30, windowMs: 60_000, scope: "admin-otel-logs" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const period = parseAdminOtelPeriod(url.searchParams.get("period"));
    const serviceName = url.searchParams.get("service_name");
    const severityText = url.searchParams.get("severity_text");
    const limit = boundedInt(url.searchParams.get("limit"), 200, 1, 500);

    if (serviceName !== null && !isSafeFilterValue(serviceName)) {
      return NextResponse.json({ error: "invalid 'service_name'" }, { status: 400 });
    }
    if (severityText !== null && !isSafeFilterValue(severityText, 40)) {
      return NextResponse.json({ error: "invalid 'severity_text'" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "supabase service role not configured" },
        { status: 500 },
      );
    }

    let q = supabase
      .from("otel_logs")
      .select(
        "id, observed_timestamp, timestamp, trace_id, span_id, severity_text, severity_number, service_name, body, resource_attributes, log_attributes",
      )
      .order("observed_timestamp", { ascending: false })
      .limit(limit);

    if (period.sinceIso !== null) q = q.gte("observed_timestamp", period.sinceIso);
    if (serviceName) q = q.eq("service_name", serviceName);
    if (severityText) q = q.eq("severity_text", severityText);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let facetsQ = supabase
      .from("otel_logs")
      .select("service_name, severity_text")
      .limit(10_000);
    if (period.sinceIso !== null) facetsQ = facetsQ.gte("observed_timestamp", period.sinceIso);
    const { data: facetsData, error: facetsError } = await facetsQ;
    if (facetsError) {
      return NextResponse.json({ error: facetsError.message }, { status: 500 });
    }

    const facetRows =
      (facetsData as Array<{ service_name: string; severity_text: string | null }> | null) ?? [];
    const services = Array.from(new Set(facetRows.map((row) => row.service_name))).sort();
    const severities = Array.from(
      new Set(facetRows.map((row) => row.severity_text).filter((v): v is string => Boolean(v))),
    ).sort();

    return NextResponse.json({
      logs: data ?? [],
      services,
      severities,
      period: period.period,
      limit,
    });
  }),
);
