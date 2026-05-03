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
  { max: 30, windowMs: 60_000, scope: "admin-otel-traces" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const period = parseAdminOtelPeriod(url.searchParams.get("period"));
    const serviceName = url.searchParams.get("service_name");
    const limit = boundedInt(url.searchParams.get("limit"), 2500, 1, 5000);

    if (serviceName !== null && !isSafeFilterValue(serviceName)) {
      return NextResponse.json({ error: "invalid 'service_name'" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "supabase service role not configured" },
        { status: 500 },
      );
    }

    let q = supabase
      .from("otel_traces")
      .select(
        "id, trace_id, span_id, parent_span_id, service_name, span_name, span_kind, start_time, end_time, duration_ms, status_code, status_message, resource_attributes, span_attributes, events, links",
      )
      .order("start_time", { ascending: false })
      .limit(limit);

    if (period.sinceIso !== null) q = q.gte("start_time", period.sinceIso);
    if (serviceName) q = q.eq("service_name", serviceName);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let servicesQ = supabase
      .from("otel_traces")
      .select("service_name")
      .limit(10_000);
    if (period.sinceIso !== null) servicesQ = servicesQ.gte("start_time", period.sinceIso);
    const { data: servicesData, error: servicesError } = await servicesQ;
    if (servicesError) {
      return NextResponse.json({ error: servicesError.message }, { status: 500 });
    }

    const services = Array.from(
      new Set(
        ((servicesData as Array<{ service_name: string }> | null) ?? []).map(
          (row) => row.service_name,
        ),
      ),
    ).sort();

    return NextResponse.json({
      spans: data ?? [],
      services,
      period: period.period,
      limit,
    });
  }),
);
