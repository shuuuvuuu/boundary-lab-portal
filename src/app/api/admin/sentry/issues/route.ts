import { NextResponse } from "next/server";
import { withOwnerOrGuest } from "@/lib/auth/with-auth";
import { withRateLimit } from "@/lib/rate-limit/with-rate-limit";
import {
  getServiceConfig,
  listIssues,
  type SentryIssue,
  type SentryService,
} from "@/lib/sentry/client";

type IssueWithProjectTag = SentryIssue & { _projectTag: string; _service: SentryService };

function parseService(url: URL): SentryService | null {
  const raw = url.searchParams.get("service");
  if (raw === null || raw === "") return "boundary";
  if (raw === "boundary" || raw === "rezona") return raw;
  return null;
}

type CategoryFilter = "all" | "error" | "performance";

function parseCategory(url: URL): CategoryFilter {
  const raw = url.searchParams.get("category") ?? "all";
  if (raw === "error" || raw === "performance") return raw;
  return "all";
}

function parseStatsPeriod(url: URL): string {
  const raw = url.searchParams.get("statsPeriod") ?? "";
  if (/^\d{1,4}[mhd]$/.test(raw)) return raw;
  return "24h";
}

/**
 * Sentry の issues API に渡す `query` 文字列を組み立てる。
 *  - all          : `is:unresolved`
 *  - error        : `is:unresolved !issue.category:performance`
 *  - performance  : `is:unresolved issue.category:performance` (N+1 / slow query 等)
 */
function queryForCategory(category: CategoryFilter): string {
  if (category === "performance") return "is:unresolved issue.category:performance";
  if (category === "error") return "is:unresolved !issue.category:performance";
  return "is:unresolved";
}

/**
 * service 別に「プロジェクト → UI ラベル」のマッピングを返す。
 * boundary は既存互換で server / web。
 * rezona は SENTRY_REZONA_PROJECTS の順に server / web / 3 つ目以降はそのまま slug 。
 */
function projectTagFor(service: SentryService, projectSlug: string, index: number): string {
  if (service === "boundary") {
    return index === 0 ? "server" : "web";
  }
  // rezona: カンマ区切りの順で server / web 扱い、以降はそのまま slug
  if (index === 0) return "server";
  if (index === 1) return "web";
  return projectSlug;
}

export const GET = withRateLimit(
  { max: 10, windowMs: 60_000, scope: "admin-sentry-issues" },
  withOwnerOrGuest(async (request) => {
    const url = new URL(request.url);
    const service = parseService(url);
    const category = parseCategory(url);
    const statsPeriod = parseStatsPeriod(url);
    if (service === null) {
      return NextResponse.json(
        { error: "invalid service (must be 'boundary' or 'rezona')" },
        { status: 400 },
      );
    }

    const config = getServiceConfig(service);
    if (!config) {
      // env 未設定時はエラーにせず空配列を返す（UI 側で「未設定」表示可能）
      return NextResponse.json({
        issues: [],
        service,
        category,
        configured: false,
      });
    }

    try {
      const query = queryForCategory(category);
      const results = await Promise.all(
        config.projects.map((slug) =>
          listIssues(slug, { service, query, statsPeriod }).catch((err: Error) => {
            console.error(`[sentry] ${service}/${slug} issues failed:`, err.message);
            return [] as SentryIssue[];
          }),
        ),
      );

      const merged: IssueWithProjectTag[] = [];
      config.projects.forEach((slug, idx) => {
        const tag = projectTagFor(service, slug, idx);
        for (const issue of results[idx] ?? []) {
          merged.push({ ...issue, _projectTag: tag, _service: service });
        }
      });
      merged.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));

      return NextResponse.json({ issues: merged, service, category, configured: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }),
);
