import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import {
  getLatestTransactionEvent,
  getServiceConfig,
  type SentryService,
} from "@/lib/sentry/client";

/**
 * GET /api/admin/sentry/transaction-detail?service=...&projectTag=server|web&transaction=...
 *
 * Phase 2.1 Traces drill-down 用。指定 transaction の最新 event を spans 込みで返す。
 * projectTag → 実 project slug の解決はサーバ側で実施（クライアントには slug を露出しない方針）。
 */
function parseService(url: URL): SentryService | null {
  const raw = url.searchParams.get("service");
  if (raw === null || raw === "") return "boundary";
  if (raw === "boundary" || raw === "rezona") return raw;
  return null;
}

function parseStatsPeriod(url: URL): string {
  const raw = url.searchParams.get("statsPeriod") ?? "";
  if (/^\d{1,4}[mhd]$/.test(raw)) return raw;
  return "24h";
}

function projectSlugFor(
  service: SentryService,
  projectTag: string,
  configProjects: string[],
): string | null {
  if (service === "boundary") {
    if (projectTag === "server") return configProjects[0] ?? null;
    if (projectTag === "web") return configProjects[1] ?? null;
    return null;
  }
  // rezona: 順序ベース解決
  if (projectTag === "server") return configProjects[0] ?? null;
  if (projectTag === "web") return configProjects[1] ?? null;
  // tag が slug そのものなら配列に含まれているか確認して採用
  if (configProjects.includes(projectTag)) return projectTag;
  return null;
}

export const GET = withRateLimit(
  { max: 20, windowMs: 60_000, scope: "admin-sentry-tx-detail" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = parseService(url);
    if (service === null) {
      return NextResponse.json({ error: "invalid service" }, { status: 400 });
    }

    const projectTag = url.searchParams.get("projectTag");
    const transaction = url.searchParams.get("transaction");
    if (!projectTag || !transaction) {
      return NextResponse.json(
        { error: "projectTag and transaction are required" },
        { status: 400 },
      );
    }

    const config = getServiceConfig(service);
    if (!config) {
      return NextResponse.json({ detail: null, configured: false });
    }

    const slug = projectSlugFor(service, projectTag, config.projects);
    if (!slug) {
      return NextResponse.json(
        { error: `unknown projectTag: ${projectTag}` },
        { status: 400 },
      );
    }

    const statsPeriod = parseStatsPeriod(url);
    try {
      const detail = await getLatestTransactionEvent(slug, transaction, { service, statsPeriod });
      return NextResponse.json({ detail, configured: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
