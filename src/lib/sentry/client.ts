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
  const org = process.env.SENTRY_ORG ?? "shuu";
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
  opts: { query?: string; limit?: number } = {},
): Promise<SentryIssue[]> {
  const { org } = getConfig();
  const limit = opts.limit ?? 25;
  const query = opts.query ?? "is:unresolved";
  const cacheKey = `issues:${org}:${projectSlug}:${query}:${limit}`;
  const cached = getCached<SentryIssue[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    query,
    limit: String(limit),
    sort: "date",
    statsPeriod: "24h",
  });
  const data = await sentryFetch<SentryIssue[]>(
    `/projects/${org}/${projectSlug}/issues/?${params.toString()}`,
  );
  setCached(cacheKey, data);
  return data;
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
