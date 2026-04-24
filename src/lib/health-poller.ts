import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluateAndAlert, type HealthCheckRecord } from "@/lib/health-alerts";

/**
 * Phase D-1b: 外部ヘルスチェック polling
 *
 * env:
 *   HEALTH_CHECK_ENABLED=true
 *   HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/api/healthz|60;rezona|https://.../api/health|60
 *
 * 各ターゲットを setInterval で fetch（5 秒 timeout）→ service_health_checks に INSERT →
 * evaluateAndAlert で連続失敗/復旧通知。
 *
 * 多重起動防止: globalThis フラグで guard（Next.js の module HMR / instrumentation 2 回呼びに耐える）。
 */

const FETCH_TIMEOUT_MS = 5_000;
const MIN_INTERVAL_SECONDS = 30;

export type HealthTarget = {
  service: string;
  url: string;
  intervalSeconds: number;
};

export function parseTargets(raw: string | undefined): HealthTarget[] {
  if (!raw) return [];
  const targets: HealthTarget[] = [];
  const entries = raw.split(";").map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    const parts = entry.split("|").map((s) => s.trim());
    if (parts.length < 2) {
      console.warn(`[health-poller] invalid target (need service|url[|interval]): ${entry}`);
      continue;
    }
    const [service, url, intervalRaw] = parts;
    if (!service || !url) continue;
    const intervalSeconds = Math.max(
      MIN_INTERVAL_SECONDS,
      Number(intervalRaw ?? "60") || 60,
    );
    targets.push({ service, url, intervalSeconds });
  }
  return targets;
}

function getSupabaseWriter(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function runOnce(target: HealthTarget): Promise<HealthCheckRecord> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
    });
    const elapsed = Date.now() - start;
    return {
      service: target.service,
      endpoint: target.url,
      status_code: res.status,
      response_time_ms: elapsed,
      ok: res.ok,
      error_message: res.ok ? null : `HTTP ${res.status}`,
      checked_at: new Date().toISOString(),
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `timeout after ${FETCH_TIMEOUT_MS}ms`
          : err.message
        : String(err);
    return {
      service: target.service,
      endpoint: target.url,
      status_code: null,
      response_time_ms: elapsed,
      ok: false,
      error_message: message,
      checked_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function persist(record: HealthCheckRecord): Promise<boolean> {
  const supabase = getSupabaseWriter();
  if (!supabase) {
    console.warn(
      "[health-poller] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定のため DB 書き込み skip",
    );
    return false;
  }
  try {
    const { error } = await supabase.from("service_health_checks").insert(record);
    if (error) {
      console.error("[health-poller] insert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[health-poller] insert threw:",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/**
 * 1 回分の probe を実行する（probe API からも再利用する）。
 * 戻り値は DB 書き込み成否に関係なく health check の record。
 */
export async function probeAndRecord(target: HealthTarget): Promise<HealthCheckRecord> {
  const record = await runOnce(target);
  await persist(record); // 失敗しても evaluate は続ける
  try {
    await evaluateAndAlert(target.service, record);
  } catch (err) {
    console.error(
      "[health-poller] evaluateAndAlert threw:",
      err instanceof Error ? err.message : String(err),
    );
  }
  return record;
}

const GLOBAL_KEY = "__boundaryPortalHealthPoller__";

type GlobalWithPoller = typeof globalThis & {
  [GLOBAL_KEY]?: {
    started: true;
    timers: NodeJS.Timeout[];
  };
};

/**
 * Health poller を起動する（多重起動防止）。
 *
 * env `HEALTH_CHECK_ENABLED` が truthy かつ `HEALTH_CHECK_TARGETS` にエントリがある時のみ実行。
 * `instrumentation.ts` の register() から呼ぶことを想定。
 */
export function startHealthPoller(): void {
  if (process.env.HEALTH_CHECK_ENABLED !== "true") {
    console.info("[health-poller] HEALTH_CHECK_ENABLED != 'true'. skip");
    return;
  }
  const g = globalThis as GlobalWithPoller;
  if (g[GLOBAL_KEY]?.started) {
    console.info("[health-poller] already started (skip re-init)");
    return;
  }

  const targets = parseTargets(process.env.HEALTH_CHECK_TARGETS);
  if (targets.length === 0) {
    console.warn("[health-poller] HEALTH_CHECK_TARGETS が空。起動せず終了");
    return;
  }

  console.info(
    `[health-poller] starting with ${targets.length} target(s):`,
    targets.map((t) => `${t.service}(${t.url}, ${t.intervalSeconds}s)`).join(", "),
  );

  const timers: NodeJS.Timeout[] = [];
  for (const target of targets) {
    // 初回は 5 秒遅延させて起動時バーストを避ける
    const first = setTimeout(() => {
      void probeAndRecord(target);
      const loop = setInterval(() => {
        void probeAndRecord(target);
      }, target.intervalSeconds * 1_000);
      timers.push(loop);
    }, 5_000);
    timers.push(first);
  }

  g[GLOBAL_KEY] = { started: true, timers };
}

/**
 * env から target を検索（probe API で利用）。
 */
export function findTarget(service: string): HealthTarget | null {
  const targets = parseTargets(process.env.HEALTH_CHECK_TARGETS);
  return targets.find((t) => t.service === service) ?? null;
}
