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

type ProjectIdCacheEntry = { at: number; id: string | null };
const projectIdCache = new Map<string, ProjectIdCacheEntry>();
const projectIdInFlight = new Map<string, Promise<string | null>>();
const PROJECT_ID_TTL_MS = 24 * 60 * 60 * 1000;
const PROJECT_ID_NEGATIVE_TTL_MS = 5 * 60 * 1000;

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

/**
 * Sentry Web UI の deep link で使う数値 project ID を slug から解決する。
 *
 * env 直指定を最優先し、未設定時だけ Sentry API (`/projects/{org}/{slug}/`) に問い合わせる。
 * API rate limit / token 無効時でも env があればリンク生成を継続できるようにする。
 */
export async function resolveProjectId(
  service: SentryService,
  projectSlug: string,
): Promise<string | null> {
  const config = getServiceConfig(service);
  if (!config) return null;

  const projectIndex = config.projects.indexOf(projectSlug);
  const role = projectIndex === 1 ? "WEB" : "SERVER";
  const envName = `SENTRY_${service.toUpperCase()}_${role}_PROJECT_ID`;
  const fromEnv = process.env[envName];
  if (fromEnv && /^\d+$/.test(fromEnv)) return fromEnv;

  const cacheKey = `${config.org}:${projectSlug}`;
  const hit = projectIdCache.get(cacheKey);
  if (hit) {
    const ttl = hit.id === null ? PROJECT_ID_NEGATIVE_TTL_MS : PROJECT_ID_TTL_MS;
    if (Date.now() - hit.at < ttl) return hit.id;
    projectIdCache.delete(cacheKey);
  }

  const inFlight = projectIdInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const data = await sentryFetch<{ id?: string | number }>(
        `/projects/${config.org}/${projectSlug}/`,
        config.token,
      );
      const id = data.id != null ? String(data.id) : null;
      projectIdCache.set(cacheKey, { at: Date.now(), id });
      return id;
    } catch (err) {
      projectIdCache.set(cacheKey, { at: Date.now(), id: null });
      console.warn(
        `[sentry] resolveProjectId failed for ${service}/${projectSlug}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    } finally {
      projectIdInFlight.delete(cacheKey);
    }
  })();
  projectIdInFlight.set(cacheKey, promise);
  return promise;
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

export type SentryTimeSeriesPoint = {
  /** epoch sec */
  time: number;
  /** value at this time bucket (ms or count, depends on yAxis) */
  value: number;
};

export type SentryTimeSeries = {
  /** transaction name (top events) or "*" for overall */
  key: string;
  /** project slug */
  project: string;
  points: SentryTimeSeriesPoint[];
};

/**
 * Sentry events-stats (dataset=transactions) で transaction の時系列を取得する。
 *
 * `topEvents` を指定すると上位 N 件の transaction ごとに別系列で返る。
 * Recharts などで複数線描画する用途を想定。
 *
 * yAxis は引数で切替（p95 / p50 / count）。
 * 期間は `statsPeriod` (例 "1h", "24h", "7d") を渡す。Sentry が interval を自動決定する。
 */
export async function listTransactionTimeSeries(
  projectSlug: string,
  opts: {
    yAxis?: "p95" | "p50" | "count";
    statsPeriod?: string;
    topEvents?: number;
    service?: SentryService;
  } = {},
): Promise<SentryTimeSeries[]> {
  const service = opts.service ?? "boundary";
  const config = getServiceConfig(service);
  if (!config) return [];

  const yAxisMap = {
    p95: "p95(transaction.duration)",
    p50: "p50(transaction.duration)",
    count: "count()",
  } as const;
  const yAxisField = yAxisMap[opts.yAxis ?? "p95"];
  const statsPeriod = opts.statsPeriod ?? "24h";
  const topEvents = opts.topEvents ?? 5;

  const cacheKey = `tx-stats:${service}:${config.org}:${projectSlug}:${opts.yAxis ?? "p95"}:${statsPeriod}:${topEvents}`;
  const cached = getCached<SentryTimeSeries[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    dataset: "transactions",
    statsPeriod,
    yAxis: yAxisField,
    topEvents: String(topEvents),
    query: `project:${projectSlug}`,
    orderby: "-count()",
  });
  params.append("field", "transaction");
  params.append("field", "count()");

  // Sentry top-events response 形式:
  //   { "<txname>": { "data": [[ts, [{count: N}]], ...], "order": 0 }, ... }
  // または topEvents 未指定時:
  //   { "data": [[ts, [{count: N}]], ...] }
  type StatsBucket = [number, Array<{ count?: number }>];
  type SeriesObj = { data: StatsBucket[]; order?: number };
  type Raw = Record<string, SeriesObj | { data: StatsBucket[] }>;

  const raw = await sentryFetch<Raw>(
    `/organizations/${config.org}/events-stats/?${params.toString()}`,
    config.token,
  );

  const series: SentryTimeSeries[] = [];
  // top-events 形式 (transaction 名がキー)
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "object" || value === null) continue;
    const data = (value as SeriesObj).data;
    if (!Array.isArray(data)) continue;
    series.push({
      key,
      project: projectSlug,
      points: data.map(([ts, slots]) => ({
        time: ts,
        value: Array.isArray(slots) && slots.length > 0 ? Number(slots[0]?.count ?? 0) : 0,
      })),
    });
  }

  // Sentry は order でソートしてくれる場合もあるが、明示的に時刻昇順を保証
  for (const s of series) s.points.sort((a, b) => a.time - b.time);

  setCached(cacheKey, series);
  return series;
}

export type SentrySpan = {
  span_id: string;
  parent_span_id?: string | null;
  op?: string | null;
  description?: string | null;
  start_timestamp: number;
  timestamp: number;
  status?: string | null;
  data?: Record<string, unknown> | null;
};

export type SentryTransactionDetail = {
  eventID: string;
  transaction: string;
  project: string;
  startTimestamp: number;
  endTimestamp: number;
  durationMs: number;
  rootOp: string | null;
  spans: SentrySpan[];
  permalink: string;
};

/**
 * 指定 transaction の最新 event を取得し、spans 含む詳細を返す。
 *
 * 2 段階リクエスト:
 *  1. discover で最新 event id を 1 件取得 (transaction 名 + project でフィルタ)
 *  2. project events/{event_id}/ で entries=spans を含む full event を取得
 *
 * Phase 2.1 Traces drill-down 用。
 */
export async function getLatestTransactionEvent(
  projectSlug: string,
  transactionName: string,
  opts: { service?: SentryService; statsPeriod?: string } = {},
): Promise<SentryTransactionDetail | null> {
  const service = opts.service ?? "boundary";
  const config = getServiceConfig(service);
  if (!config) return null;
  const statsPeriod = opts.statsPeriod ?? "24h";

  const cacheKey = `tx-detail:${service}:${config.org}:${projectSlug}:${transactionName}:${statsPeriod}`;
  const cached = getCached<SentryTransactionDetail>(cacheKey);
  if (cached) return cached;

  // 1. Discover で最新 event id 取得
  const findParams = new URLSearchParams({
    dataset: "transactions",
    statsPeriod,
    sort: "-timestamp",
    per_page: "1",
    query: `project:${projectSlug} transaction:"${transactionName}"`,
  });
  for (const f of ["id", "timestamp", "transaction.duration"]) {
    findParams.append("field", f);
  }

  type DiscoverRow = { id?: string; "transaction.duration"?: number };
  const discover = await sentryFetch<{ data?: DiscoverRow[] }>(
    `/organizations/${config.org}/events/?${findParams.toString()}`,
    config.token,
  );
  const eventId = discover.data?.[0]?.id;
  if (!eventId) return null;

  // 2. Project events/{event_id}/ で full event 取得
  type EventEntry = { type: string; data: unknown };
  type EventResponse = {
    eventID: string;
    transaction?: string;
    startTimestamp: number;
    endTimestamp?: number;
    timestamp?: number;
    contexts?: { trace?: { op?: string } };
    entries?: EventEntry[];
  };

  const event = await sentryFetch<EventResponse>(
    `/projects/${config.org}/${projectSlug}/events/${eventId}/`,
    config.token,
  );

  const endTs = event.endTimestamp ?? event.timestamp ?? event.startTimestamp;
  const spansEntry = event.entries?.find((e) => e.type === "spans");
  const spans = (Array.isArray(spansEntry?.data) ? spansEntry.data : []) as SentrySpan[];
  const projectId = await resolveProjectId(service, projectSlug);
  const permalink = projectId
    ? `https://${config.org}.sentry.io/performance/?project=${projectId}&transaction=${encodeURIComponent(
        transactionName,
      )}`
    : `https://${config.org}.sentry.io/performance/`;

  const detail: SentryTransactionDetail = {
    eventID: event.eventID,
    transaction: event.transaction ?? transactionName,
    project: projectSlug,
    startTimestamp: event.startTimestamp,
    endTimestamp: endTs,
    durationMs: (endTs - event.startTimestamp) * 1000,
    rootOp: event.contexts?.trace?.op ?? null,
    spans,
    permalink,
  };

  setCached(cacheKey, detail);
  return detail;
}

export type WebVitalKey = "lcp" | "fcp" | "cls" | "inp" | "ttfb";

export type WebVitalsSummary = {
  /** いずれかが取れない場合は undefined */
  lcp?: number;
  fcp?: number;
  cls?: number;
  inp?: number;
  ttfb?: number;
  count: number;
  /** apps/web project slug */
  project: string;
};

const WEB_VITAL_FIELDS: Record<WebVitalKey, string> = {
  lcp: "p75(measurements.lcp)",
  fcp: "p75(measurements.fcp)",
  cls: "p75(measurements.cls)",
  inp: "p75(measurements.inp)",
  ttfb: "p75(measurements.ttfb)",
};

/**
 * apps/web (boundary-metaverse-web 等) の Web Vitals 現在値を集計取得する。
 *
 * boundary では service config の projects[1] (web) を採用。
 * Phase 2.1 Web Vitals タブ用。
 */
export async function getWebVitalsSummary(
  opts: { service?: SentryService; statsPeriod?: string } = {},
): Promise<WebVitalsSummary | null> {
  const service = opts.service ?? "boundary";
  const config = getServiceConfig(service);
  if (!config) return null;
  const webProject = config.projects[1] ?? config.projects[0];
  if (!webProject) return null;
  const statsPeriod = opts.statsPeriod ?? "24h";

  const cacheKey = `web-vitals:${service}:${config.org}:${webProject}:${statsPeriod}`;
  const cached = getCached<WebVitalsSummary>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    dataset: "transactions",
    statsPeriod,
    query: `project:${webProject}`,
    per_page: "1",
  });
  for (const field of Object.values(WEB_VITAL_FIELDS)) params.append("field", field);
  params.append("field", "count()");

  type Raw = { data?: Array<Record<string, string | number>> };
  const raw = await sentryFetch<Raw>(
    `/organizations/${config.org}/events/?${params.toString()}`,
    config.token,
  );
  const row = raw.data?.[0];
  if (!row) {
    const empty: WebVitalsSummary = { count: 0, project: webProject };
    setCached(cacheKey, empty);
    return empty;
  }

  const summary: WebVitalsSummary = {
    project: webProject,
    count: Number(row["count()"] ?? 0),
  };
  for (const [key, fieldName] of Object.entries(WEB_VITAL_FIELDS)) {
    const v = row[fieldName];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      summary[key as WebVitalKey] = v;
    }
  }
  setCached(cacheKey, summary);
  return summary;
}

/**
 * 指定 Web Vital の時系列を取得する (events-stats yAxis=p75(measurements.lcp) 等)。
 */
export async function getWebVitalTimeSeries(
  vital: WebVitalKey,
  opts: { service?: SentryService; statsPeriod?: string } = {},
): Promise<SentryTimeSeries | null> {
  const service = opts.service ?? "boundary";
  const config = getServiceConfig(service);
  if (!config) return null;
  const webProject = config.projects[1] ?? config.projects[0];
  if (!webProject) return null;
  const statsPeriod = opts.statsPeriod ?? "24h";

  const yAxisField = WEB_VITAL_FIELDS[vital];
  const cacheKey = `web-vital-stats:${service}:${config.org}:${webProject}:${vital}:${statsPeriod}`;
  const cached = getCached<SentryTimeSeries>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    dataset: "transactions",
    statsPeriod,
    yAxis: yAxisField,
    query: `project:${webProject}`,
  });

  type StatsBucket = [number, Array<{ count?: number }>];
  const raw = await sentryFetch<{ data?: StatsBucket[] }>(
    `/organizations/${config.org}/events-stats/?${params.toString()}`,
    config.token,
  );

  const series: SentryTimeSeries = {
    key: vital,
    project: webProject,
    points: (raw.data ?? []).map(([ts, slots]) => ({
      time: ts,
      value: Array.isArray(slots) && slots.length > 0 ? Number(slots[0]?.count ?? 0) : 0,
    })),
  };
  series.points.sort((a, b) => a.time - b.time);
  setCached(cacheKey, series);
  return series;
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
  projectIdCache.clear();
  projectIdInFlight.clear();
}
