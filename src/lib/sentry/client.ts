const SENTRY_API_BASE = "https://sentry.io/api/0";
const CACHE_TTL_MS = 5 * 60 * 1000;

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  status: string;
  permalink: string;
  firstSeen: string;
  lastSeen: string;
  count: string;
  userCount: number;
  project: { slug: string; name: string };
  metadata: { type?: string; value?: string; filename?: string } | null;
};

export type SentryEvent = {
  id: string;
  eventID: string;
  dateCreated: string;
  message: string | null;
  title: string;
  location: string | null;
  culprit: string | null;
  platform: string;
  type: string;
  entries: Array<{ type: string; data: unknown }>;
  tags: Array<{ key: string; value: string }>;
  contexts: Record<string, unknown>;
};

export type SentryIssueDetail = SentryIssue & {
  latestEvent: SentryEvent | null;
};

type CacheEntry<T> = { at: number; data: T };
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { at: Date.now(), data });
}

function getConfig() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG ?? "shuu-dw";
  if (!token) {
    throw new Error("SENTRY_AUTH_TOKEN is not set");
  }
  return { token, org };
}

async function sentryFetch<T>(path: string): Promise<T> {
  const { token } = getConfig();
  const res = await fetch(`${SENTRY_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sentry API ${res.status}: ${body.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}

export async function listIssues(
  projectSlug: string,
  opts: { query?: string; limit?: number; statsPeriod?: string } = {},
): Promise<SentryIssue[]> {
  const { org } = getConfig();
  const limit = opts.limit ?? 25;
  const query = opts.query ?? "is:unresolved";
  const statsPeriod = opts.statsPeriod ?? "24h";
  const cacheKey = `issues:${org}:${projectSlug}:${query}:${limit}:${statsPeriod}`;
  const cached = getCached<SentryIssue[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    query,
    limit: String(limit),
    sort: "date",
    statsPeriod,
  });
  const data = await sentryFetch<SentryIssue[]>(
    `/projects/${org}/${projectSlug}/issues/?${params.toString()}`,
  );
  setCached(cacheKey, data);
  return data;
}

/**
 * Sentry Events API で warning / error level の Event 直近一覧を取得する。
 *
 * Phase 1 (monitoring) の Logs タブ用。
 * pino-sentry-transport 経由で届く warn/error ログは Sentry 上では Message event として
 * 保存される。厳密な "Logs" データセットは Sentry の新機能（experimental）だが、
 * Phase 1 では既存の `/projects/{org}/{slug}/events/` を level フィルタで叩いて
 * Message ベースのイベントだけを timeline 表示する。
 *
 * Sentry の Events API は Issues とは別に「各発生イベント」を返すため、
 * 同じ issue でも発生毎に 1 行表示できる（=log 的）。
 *
 * 参考: GET /api/0/projects/{org}/{slug}/events/ は stable な endpoint。
 */
export type SentryLogEvent = {
  id: string;
  eventID: string;
  dateCreated: string;
  message: string | null;
  title: string;
  level?: string;
  location: string | null;
  culprit: string | null;
  platform: string;
  groupID: string | null;
  tags: Array<{ key: string; value: string }>;
};

export async function listEvents(
  projectSlug: string,
  opts: { level?: "warning" | "error"; limit?: number } = {},
): Promise<SentryLogEvent[]> {
  const { org } = getConfig();
  const limit = opts.limit ?? 50;
  const cacheKey = `events:${org}:${projectSlug}:${opts.level ?? "all"}:${limit}`;
  const cached = getCached<SentryLogEvent[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    limit: String(limit * 3),
    full: "true",
  });
  const raw = await sentryFetch<SentryLogEvent[]>(
    `/projects/${org}/${projectSlug}/events/?${params.toString()}`,
  );
  const allowed: ReadonlySet<string> = opts.level
    ? new Set([opts.level])
    : new Set(["warning", "error", "fatal"]);
  const filtered = raw
    .filter((e) => typeof e.level === "string" && allowed.has(e.level))
    .slice(0, limit);
  setCached(cacheKey, filtered);
  return filtered;
}

export async function getIssue(issueId: string): Promise<SentryIssueDetail> {
  const cacheKey = `issue:${issueId}`;
  const cached = getCached<SentryIssueDetail>(cacheKey);
  if (cached) return cached;

  const [issue, latestEvent] = await Promise.all([
    sentryFetch<SentryIssue>(`/issues/${issueId}/`),
    sentryFetch<SentryEvent>(`/issues/${issueId}/events/latest/`).catch(() => null),
  ]);

  const detail: SentryIssueDetail = { ...issue, latestEvent };
  setCached(cacheKey, detail);
  return detail;
}

export function clearCache(): void {
  cache.clear();
}
