import { getServiceConfig, resolveProjectId, type SentryService } from "./client";

export type ActivityEventForLink = {
  service: string;
  event_type: "user_action" | "api_request" | "server_event";
  action: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

const SENTRY_TIME_WINDOW_MS = 30 * 60_000;

function quoteSearchValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Activity タブ用 Sentry deep link を server-side で生成する。
 *
 * 単体動作確認:
 * - `.env.local` に `SENTRY_BOUNDARY_SERVER_PROJECT_ID` などを設定し、
 *   `/api/admin/activity?limit=1` の `events[].sentry_link` が `project=<数値>` を含むことを確認。
 * - env を外した状態では、有効な Sentry token で API resolve にフォールバックすることを確認。
 * - env 未設定かつ API resolve 失敗時は `sentry_link: null` になり、UI の `Sentry ↗` は非表示。
 */
export async function buildSentryDeepLink(
  row: ActivityEventForLink,
): Promise<string | null> {
  const service: SentryService = row.service === "rezona" ? "rezona" : "boundary";
  const config = getServiceConfig(service);
  if (!config) return null;

  const serverSlug = config.projects[0];
  if (!serverSlug) return null;

  const projectId = await resolveProjectId(service, serverSlug);
  if (!projectId) return null;

  const occurredMs = new Date(row.occurred_at).getTime();
  if (!Number.isFinite(occurredMs)) return null;

  const start = new Date(occurredMs - SENTRY_TIME_WINDOW_MS).toISOString();
  const end = new Date(occurredMs + SENTRY_TIME_WINDOW_MS).toISOString();

  if (row.event_type === "api_request") {
    const method = stringValue(row.metadata?.method) ?? row.action.split(" ")[0] ?? "";
    const path =
      stringValue(row.metadata?.path) ?? row.action.split(" ").slice(1).join(" ");
    const transaction = `${method} ${path}`.trim();
    if (!transaction) return null;

    const params = new URLSearchParams({
      query: `transaction:${quoteSearchValue(transaction)}`,
      statsPeriod: "24h",
      dataset: "transactions",
      project: projectId,
      sort: "-timestamp",
    });
    return `https://${config.org}.sentry.io/discover/results/?${params.toString()}`;
  }

  if (row.event_type === "server_event") {
    const params = new URLSearchParams({
      query: "is:unresolved",
      project: projectId,
      start,
      end,
    });
    return `https://${config.org}.sentry.io/issues/?${params.toString()}`;
  }

  if (row.event_type === "user_action") {
    const params = new URLSearchParams({
      query: `message:${quoteSearchValue(row.action)}`,
      statsPeriod: "24h",
      dataset: "errors",
      project: projectId,
    });
    return `https://${config.org}.sentry.io/discover/results/?${params.toString()}`;
  }

  return null;
}

export async function attachSentryLinks<T extends ActivityEventForLink>(
  rows: T[],
): Promise<Array<T & { sentry_link: string | null }>> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      sentry_link: await buildSentryDeepLink(row),
    })),
  );
}
