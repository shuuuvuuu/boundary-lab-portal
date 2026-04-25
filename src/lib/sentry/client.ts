const SENTRY_API_BASE = "https://sentry.io/api/0";
const CACHE_TTL_MS = 5 * 60 * 1000;

export type SentryService = "boundary" | "rezona";

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

type ServiceConfig = {
  token: string;
  org: string;
  /** 監視対象プロジェクト slug 一覧 (Issues/Events 取得はこの配列を合成する) */
  projects: string[];
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

/**
 * service ごとの Sentry 接続設定を返す。
 *
 * - boundary: 既存の SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_SERVER_PROJECT / SENTRY_WEB_PROJECT を使用
 * - rezona: SENTRY_REZONA_* を優先。未設定なら共通 env にフォールバック。
 *           それでも project が無ければ null を返し、呼び出し側で空配列フォールバック。
 *
 * 返り値が null の場合は「未設定 → 監視対象外」として扱う。
 */
export function getServiceConfig(service: SentryService = "boundary"): ServiceConfig | null {
  if (service === "boundary") {
    const token = process.env.SENTRY_AUTH_TOKEN;
    const org = process.env.SENTRY_ORG ?? "shuu-dw";
    if (!token) return null;
    const serverProject = process.env.SENTRY_SERVER_PROJECT ?? "boundary-metaverse-server";
    const webProject = process.env.SENTRY_WEB_PROJECT ?? "boundary-metaverse-web";
    const projects = [serverProject, webProject].filter(Boolean);
    if (projects.length === 0) return null;
    return { token, org, projects };
  }

  // service === "rezona"
  const token = process.env.SENTRY_REZONA_AUTH_TOKEN ?? process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_REZONA_ORG ?? process.env.SENTRY_ORG ?? "shuu-dw";
  const raw = process.env.SENTRY_REZONA_PROJECTS ?? "";
  const projects = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!token) return null;
  if (projects.length === 0) return null;
  return { token, org, projects };
}

export function isServiceConfigured(service: SentryService): boolean {
  return getServiceConfig(service) !== null;
}

async function sentryFetch<T>(path: string, token: string): Promise<T> {
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
  opts: {
    query?: string;
    limit?: number;
    statsPeriod?: string;
    service?: SentryService;
  } = {},
): Promise<SentryIssue[]> {
  const service = opts.service ?? "boundary";
  const config = getServiceConfig(service);
  if (!config) return [];

  const limit = opts.limit ?? 25;
  const query = opts.query ?? "is:unresolved";
  const statsPeriod = opts.statsPeriod ?? "24h";
  const cacheKey = `issues:${service}:${config.org}:${projectSlug}:${query}:${limit}:${statsPeriod}`;
  const cached = getCached<SentryIssue[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    query,
    limit: String(limit),
    sort: "date",
    statsPeriod,
  });
  const data = await sentryFetch<SentryIssue[]>(
    `/projects/${config.org}/${projectSlug}/issues/?${params.toString()}`,
    config.token,
  );
  setCached(cacheKey, data);
  return data;
}

/**
 * Sentry Events API で warning / error level の Event 直近一覧を取得する。
 *
 * Phase 1 (monitoring) の Logs タブ用。
 * pino-sentry-transport 経由で届く warn/error ログは Sentry 上では Message event として
 * 保存される。
 */
export async function listEvents(
  projectSlug: string,
  opts: {
    level?: "warning" | "error";
    limit?: number;
    service?: SentryService;
  } = {},
): Promise<SentryLogEvent[]> {
  const service = opts.service ?? "boundary";
  const config = getServiceConfig(service);
  if (!config) return [];

  const limit = opts.limit ?? 50;
  const cacheKey = `events:${service}:${config.org}:${projectSlug}:${opts.level ?? "all"}:${limit}`;
  const cached = getCached<SentryLogEvent[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    limit: String(limit * 3),
    full: "true",
  });
  const raw = await sentryFetch<SentryLogEvent[]>(
    `/projects/${config.org}/${projectSlug}/events/?${params.toString()}`,
    config.token,
  );
  const allowed: ReadonlySet<string> = opts.level
    ? new Set([opts.level])
    : new Set(["warning", "error", "fatal"]);
  const normalized = raw.map((e) => {
    if (typeof e.level === "string" && e.level.length > 0) return e;
    const levelTag = e.tags?.find((t) => t.key === "level")?.value;
    return levelTag ? { ...e, level: levelTag } : e;
  });
  const filtered = normalized
    .filter((e) => typeof e.level === "string" && allowed.has(e.level))
    .slice(0, limit);
  if (raw.length > 0 && filtered.length === 0) {
    console.warn(
      `[sentry] listEvents: ${service}/${projectSlug} raw=${raw.length} filtered=0, sample.level=${normalized[0]?.level ?? "undef"} sample.tags=${JSON.stringify(normalized[0]?.tags?.slice(0, 3) ?? [])}`,
    );
  }
  setCached(cacheKey, filtered);
  return filtered;
}

export type SentryTransactionSummary = {
  transaction: string;
  project: string;
  count: number;
  avgDuration: number;
  p50: number;
  p95: number;
  failureRate: number;
};

/**
 * Sentry Discover (dataset=transactions) API で transaction 単位の性能サマリを取得する。
 *
 * Phase 2 (Traces タブ) 用。service/project ごとに p50 / p95 / count / failure_rate を
 * transaction 名単位で集計する。Developer 無料プランでは transactions quota が
 * 10K/月と厳しいため、画面側の表示で「該当期間に transaction が無い場合の説明文」を
 * 必ず併記すること。
 */
export async function listTransactions(
  projectSlug: string,
  opts: {
    limit?: number;
    statsPeriod?: string;
    service?: SentryService;
  } = {},
): Promise<SentryTransactionSummary[]> {
  const service = opts.service ?? "boundary";
  const config = getServiceConfig(service);
  if (!config) return [];

  const limit = opts.limit ?? 25;
  const statsPeriod = opts.statsPeriod ?? "24h";
  const cacheKey = `transactions:${service}:${config.org}:${projectSlug}:${limit}:${statsPeriod}`;
  const cached = getCached<SentryTransactionSummary[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    dataset: "transactions",
    statsPeriod,
    sort: "-count()",
    per_page: String(limit),
    query: `project:${projectSlug}`,
  });
  for (const f of [
    "transaction",
    "count()",
    "avg(transaction.duration)",
    "p50(transaction.duration)",
    "p95(transaction.duration)",
    "failure_rate()",
  ]) {
    params.append("field", f);
  }

  type Raw = { data?: Array<Record<string, string | number>> };
  const raw = await sentryFetch<Raw>(
    `/organizations/${config.org}/events/?${params.toString()}`,
    config.token,
  );

  const summaries: SentryTransactionSummary[] = (raw.data ?? []).map((row) => ({
    transaction: String(row.transaction ?? ""),
    project: projectSlug,
    count: Number(row["count()"] ?? 0),
    avgDuration: Number(row["avg(transaction.duration)"] ?? 0),
    p50: Number(row["p50(transaction.duration)"] ?? 0),
    p95: Number(row["p95(transaction.duration)"] ?? 0),
    failureRate: Number(row["failure_rate()"] ?? 0),
  }));

  setCached(cacheKey, summaries);
  return summaries;
}

export async function getIssue(
  issueId: string,
  opts: { service?: SentryService } = {},
): Promise<SentryIssueDetail | null> {
  const service = opts.service ?? "boundary";
  const config = getServiceConfig(service);
  if (!config) return null;

  const cacheKey = `issue:${service}:${issueId}`;
  const cached = getCached<SentryIssueDetail>(cacheKey);
  if (cached) return cached;

  const [issue, latestEvent] = await Promise.all([
    sentryFetch<SentryIssue>(`/issues/${issueId}/`, config.token),
    sentryFetch<SentryEvent>(`/issues/${issueId}/events/latest/`, config.token).catch(() => null),
  ]);

  const detail: SentryIssueDetail = { ...issue, latestEvent };
  setCached(cacheKey, detail);
  return detail;
}

export function clearCache(): void {
  cache.clear();
}
