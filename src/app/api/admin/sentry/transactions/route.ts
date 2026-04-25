import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import {
  getServiceConfig,
  listTransactions,
  type SentryService,
  type SentryTransactionSummary,
} from "@/lib/sentry/client";

/**
 * GET /api/admin/sentry/transactions?service=boundary|rezona&statsPeriod=24h&limit=25
 *
 * Phase 2 (監視) Traces タブ用。
 * 指定サービスの全 Sentry project について、transaction 単位で
 * count / avg / p50 / p95 / failure_rate を集計して返す。
 *
 * Developer 無料プランでは spans quota が 10K/月のため、`tracesSampleRate` を
 * 小さく保つか、使用期間によっては空配列が返ることもある。
 */
type TransactionWithProjectTag = SentryTransactionSummary & {
  _projectTag: string;
  _service: SentryService;
};

function parseService(url: URL): SentryService | null {
  const raw = url.searchParams.get("service");
  if (raw === null || raw === "") return "boundary";
  if (raw === "boundary" || raw === "rezona") return raw;
  return null;
}

function parseStatsPeriod(url: URL): string {
  const raw = url.searchParams.get("statsPeriod") ?? "";
  // 許容: 分/時間/日の数値+単位のみ (例: "15m", "24h", "7d")
  if (/^\d{1,4}[mhd]$/.test(raw)) return raw;
  return "24h";
}

function parseLimit(url: URL): number {
  const raw = Number(url.searchParams.get("limit") ?? "");
  if (!Number.isFinite(raw) || raw <= 0 || raw > 100) return 25;
  return Math.floor(raw);
}

function projectTagFor(service: SentryService, projectSlug: string, index: number): string {
  if (service === "boundary") {
    return index === 0 ? "server" : "web";
  }
  if (index === 0) return "server";
  if (index === 1) return "web";
  return projectSlug;
}

export const GET = withRateLimit(
  { max: 10, windowMs: 60_000, scope: "admin-sentry-transactions" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = parseService(url);
    const statsPeriod = parseStatsPeriod(url);
    const limit = parseLimit(url);

    if (service === null) {
      return NextResponse.json(
        { error: "invalid service (must be 'boundary' or 'rezona')" },
        { status: 400 },
      );
    }

    const config = getServiceConfig(service);
    if (!config) {
      return NextResponse.json({
        transactions: [],
        service,
        statsPeriod,
        configured: false,
      });
    }

    try {
      const results = await Promise.all(
        config.projects.map((slug) =>
          listTransactions(slug, { service, statsPeriod, limit }).catch((err: Error) => {
            console.error(`[sentry] ${service}/${slug} transactions failed:`, err.message);
            return [] as SentryTransactionSummary[];
          }),
        ),
      );

      const merged: TransactionWithProjectTag[] = [];
      config.projects.forEach((slug, idx) => {
        const tag = projectTagFor(service, slug, idx);
        for (const tx of results[idx] ?? []) {
          merged.push({ ...tx, _projectTag: tag, _service: service });
        }
      });
      merged.sort((a, b) => b.count - a.count);

      return NextResponse.json({
        transactions: merged,
        service,
        statsPeriod,
        configured: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
