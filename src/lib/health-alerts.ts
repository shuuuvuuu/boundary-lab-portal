import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notifyDiscord } from "@/lib/alerts/discord";

/**
 * Phase D-1c: Discord 連続失敗アラート
 *
 * - 直近 WINDOW 件取得
 * - 直近 FAIL_THRESHOLD 件が連続失敗 → down alert
 * - down alert は SUPPRESS_MS 以内の再送を抑制
 * - 直近 1 件 ok かつ 前回 down alert から RECOVERY_AFTER_MS 以上経過 → recovery alert
 */

const WINDOW = 5;
const FAIL_THRESHOLD = 3;
const SUPPRESS_MS = 10 * 60 * 1000; // 10 分
const RECOVERY_AFTER_MS = 60 * 1000; // 60 秒

type AlertMemory = {
  lastDownAt: number | null;
  lastRecoveryAt: number | null;
  /** down 状態に入ったまま recovery 未送信か */
  downActive: boolean;
};

const memory = new Map<string, AlertMemory>();

function getMemory(service: string): AlertMemory {
  const hit = memory.get(service);
  if (hit) return hit;
  const fresh: AlertMemory = { lastDownAt: null, lastRecoveryAt: null, downActive: false };
  memory.set(service, fresh);
  return fresh;
}

export type HealthCheckRecord = {
  service: string;
  endpoint: string;
  status_code: number | null;
  response_time_ms: number | null;
  ok: boolean;
  error_message: string | null;
  checked_at: string;
};

function getSupabaseReader(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * 最新 1 件を含む直近 N 件を取得して連続失敗 / 復旧を評価し、
 * 必要であれば Discord に通知する。
 *
 * latestCheck は DB 書き込み成功前に渡しても、書き込み失敗時でも
 * 呼ばれて問題ないように実装する（in-memory で latestCheck を混ぜる）。
 */
export async function evaluateAndAlert(
  service: string,
  latestCheck: HealthCheckRecord,
): Promise<void> {
  const supabase = getSupabaseReader();

  // DB から直近 WINDOW-1 件を引いて、latestCheck を先頭に合成する。
  // 書き込みが成功していれば DB に既に入っているが、INSERT 失敗パスでも
  // 判定に漏れないよう「latestCheck を必ず 1 件目として採用する」方式。
  let recentFromDb: HealthCheckRecord[] = [];
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("service_health_checks")
        .select("service, endpoint, status_code, response_time_ms, ok, error_message, checked_at")
        .eq("service", service)
        .order("checked_at", { ascending: false })
        .limit(WINDOW);
      if (!error && Array.isArray(data)) {
        recentFromDb = data as HealthCheckRecord[];
      }
    } catch (err) {
      // DB 取得失敗時は latestCheck のみで判定（情報不足のため実害は小さい）
      console.error(
        "[health-alerts] supabase select failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // latestCheck が DB に既に入っていれば 1 件目と checked_at が一致するはず。
  // 重複を避けるため、checked_at が一致する先頭要素があれば除外。
  const dedupedDb = recentFromDb.filter((r) => r.checked_at !== latestCheck.checked_at);
  const window = [latestCheck, ...dedupedDb].slice(0, WINDOW);

  const mem = getMemory(service);
  const now = Date.now();

  // ---- down 判定: 直近 FAIL_THRESHOLD 件が全て ok === false ----
  const lastN = window.slice(0, FAIL_THRESHOLD);
  const allFailed = lastN.length >= FAIL_THRESHOLD && lastN.every((r) => !r.ok);

  if (allFailed) {
    const suppress = mem.lastDownAt !== null && now - mem.lastDownAt < SUPPRESS_MS;
    if (!suppress) {
      mem.lastDownAt = now;
      mem.downActive = true;
      const statusLine =
        latestCheck.status_code !== null
          ? `HTTP ${latestCheck.status_code}`
          : latestCheck.error_message ?? "connection failed";
      await notifyDiscord(
        "error",
        `[${service}] DOWN — 直近 ${FAIL_THRESHOLD} 回連続失敗`,
        {
          endpoint: latestCheck.endpoint,
          status: statusLine,
          response_time_ms: latestCheck.response_time_ms ?? "timeout",
          checked_at: latestCheck.checked_at,
        },
      );
    }
    return;
  }

  // ---- recovery 判定: 最新 1 件が ok かつ 以前 down 状態 ----
  if (latestCheck.ok && mem.downActive) {
    const sinceDown = mem.lastDownAt !== null ? now - mem.lastDownAt : Infinity;
    if (sinceDown >= RECOVERY_AFTER_MS) {
      mem.downActive = false;
      mem.lastRecoveryAt = now;
      await notifyDiscord("info", `[${service}] RECOVERED — 正常応答を確認`, {
        endpoint: latestCheck.endpoint,
        status_code: latestCheck.status_code ?? "-",
        response_time_ms: latestCheck.response_time_ms ?? "-",
        checked_at: latestCheck.checked_at,
      });
    }
  }
}

// テスト容易化のため、メモリをリセットする helper
export function __resetAlertMemoryForTest(): void {
  memory.clear();
}
