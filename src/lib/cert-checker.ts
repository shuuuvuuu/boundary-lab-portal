import tls from "node:tls";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notifyDiscord } from "@/lib/alerts/discord";

/**
 * Phase D-1 追加: TLS 証明書期限チェック
 *
 * 目的: boundarylabo.com / portal.boundarylabo.com の Let's Encrypt 証明書を
 * 定期的に確認し、期限切れ直前に Discord へ警告する。
 *
 * env:
 *   CERT_CHECK_TARGETS=boundarylabo.com,portal.boundarylabo.com   # カンマ区切りの host
 *   CERT_CHECK_INTERVAL_HOURS=24                                   # 既定 24、最低 1
 *
 * 結果保存: 既存 `service_health_checks` テーブルを流用。
 *   service          = `cert:<host>`
 *   endpoint         = `<host>:443`
 *   response_time_ms = 残日数（days until expiry）
 *   status_code      = null
 *   ok               = 残日数 >= 30
 *   error_message    = 期限切れ/取得失敗理由
 *
 * 警告は既存 `evaluateAndAlert`（連続失敗アラート）とは独立で、下記 2 段階：
 *   - 残 30 日以下 → warn（info でなく warn レベル）
 *   - 残  7 日以下 → error
 * 連続失敗のような窓判定は不要で、チェック毎に 1 回通知（抑制は SUPPRESS 制御）。
 */

const DEFAULT_INTERVAL_HOURS = 24;
const MIN_INTERVAL_HOURS = 1;
const CONNECT_TIMEOUT_MS = 8_000;
const WARN_DAYS = 30;
const CRITICAL_DAYS = 7;
/** 同一 host × 同一重大度の通知抑制窓（12 時間） */
const ALERT_SUPPRESS_MS = 12 * 60 * 60 * 1000;

type Severity = "ok" | "warn" | "critical" | "expired" | "error";

type AlertMemory = Map<string, { at: number; severity: Severity }>;

type GlobalWithCert = typeof globalThis & {
  __boundaryPortalCertChecker__?: {
    started: true;
    timers: NodeJS.Timeout[];
    alertMemory: AlertMemory;
  };
};

export type CertExpiryResult = {
  host: string;
  /** 取得成功時のみ ISO 文字列。失敗時は null */
  expiresAt: string | null;
  /** 取得成功時のみ残日数（負値は期限切れ）。失敗時は null */
  daysUntilExpiry: number | null;
  /** 残 WARN_DAYS 日以上かつ未期限かつ通信成功で true */
  ok: boolean;
  /** 失敗時の理由。成功時は null */
  error: string | null;
};

export function parseCertTargets(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s, i, arr) => arr.indexOf(s) === i);
}

export function parseCertIntervalHours(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_HOURS;
  return Math.max(MIN_INTERVAL_HOURS, Math.floor(n));
}

/**
 * host:port に TLS connect して peer cert を取得し、`valid_to` を Date に変換して返す。
 * 失敗時は error メッセージを返す（throw しない）。
 */
export async function checkCertExpiry(hostInput: string): Promise<CertExpiryResult> {
  // ユーザー入力が `host:port` 形式の可能性を考慮する。未指定は 443。
  const [host, portRaw] = hostInput.split(":");
  const port = portRaw ? Number(portRaw) : 443;
  if (!host || !Number.isFinite(port)) {
    return {
      host: hostInput,
      expiresAt: null,
      daysUntilExpiry: null,
      ok: false,
      error: "invalid host specifier",
    };
  }

  return new Promise<CertExpiryResult>((resolve) => {
    let settled = false;
    const finish = (result: CertExpiryResult) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // noop
      }
      resolve(result);
    };

    const socket = tls.connect(
      {
        host,
        port,
        servername: host, // SNI。host が IP の時以外は必要
        // 期限切れ検査のため、cert validity が切れていても接続そのものは成功させたい。
        // ただし rejectUnauthorized=false を常用すると誤って不正な cert の期限を
        // 読んでしまう可能性があるため、デフォルトで true とし失敗時は `valid_to`
        // を読んでから再度判定する方針。
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate(false);
        if (!cert || !cert.valid_to) {
          finish({
            host,
            expiresAt: null,
            daysUntilExpiry: null,
            ok: false,
            error: "empty peer certificate",
          });
          return;
        }

        const expiresAt = new Date(cert.valid_to);
        if (Number.isNaN(expiresAt.getTime())) {
          finish({
            host,
            expiresAt: null,
            daysUntilExpiry: null,
            ok: false,
            error: `invalid valid_to: ${cert.valid_to}`,
          });
          return;
        }

        const diffMs = expiresAt.getTime() - Date.now();
        const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        const ok = days >= WARN_DAYS;
        finish({
          host,
          expiresAt: expiresAt.toISOString(),
          daysUntilExpiry: days,
          ok,
          error: days < 0 ? "certificate already expired" : null,
        });
      },
    );

    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      finish({
        host,
        expiresAt: null,
        daysUntilExpiry: null,
        ok: false,
        error: `tls connect timeout after ${CONNECT_TIMEOUT_MS}ms`,
      });
    });

    socket.once("error", (err) => {
      finish({
        host,
        expiresAt: null,
        daysUntilExpiry: null,
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    });
  });
}

function getSupabaseWriter(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function persistCertResult(result: CertExpiryResult): Promise<void> {
  const supabase = getSupabaseWriter();
  if (!supabase) {
    console.warn(
      "[cert-checker] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定のため DB 書き込み skip",
    );
    return;
  }
  const record = {
    service: `cert:${result.host}`,
    endpoint: `${result.host}:443`,
    status_code: null as number | null,
    response_time_ms: result.daysUntilExpiry,
    ok: result.ok,
    error_message: result.error,
    checked_at: new Date().toISOString(),
  };
  try {
    const { error } = await supabase.from("service_health_checks").insert(record);
    if (error) {
      console.error("[cert-checker] insert failed:", error.message);
    }
  } catch (err) {
    console.error(
      "[cert-checker] insert threw:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

function classify(result: CertExpiryResult): Severity {
  if (result.error && result.daysUntilExpiry === null) return "error";
  if (result.daysUntilExpiry !== null && result.daysUntilExpiry < 0) return "expired";
  if (result.daysUntilExpiry !== null && result.daysUntilExpiry <= CRITICAL_DAYS) return "critical";
  if (result.daysUntilExpiry !== null && result.daysUntilExpiry <= WARN_DAYS) return "warn";
  return "ok";
}

async function maybeAlert(result: CertExpiryResult, memory: AlertMemory): Promise<void> {
  const severity = classify(result);
  if (severity === "ok") {
    // ok に戻ったら次回の warn を発火可能にするため memory をクリアする
    memory.delete(result.host);
    return;
  }

  const prev = memory.get(result.host);
  const now = Date.now();
  if (prev && prev.severity === severity && now - prev.at < ALERT_SUPPRESS_MS) {
    return;
  }
  memory.set(result.host, { at: now, severity });

  const meta: Record<string, unknown> = {
    host: result.host,
    expires_at: result.expiresAt ?? "-",
    days_until_expiry:
      result.daysUntilExpiry !== null ? result.daysUntilExpiry : "-",
  };
  if (result.error) meta.error = result.error;

  if (severity === "error") {
    await notifyDiscord(
      "warn",
      `[cert:${result.host}] 証明書チェック失敗 — 接続 or 取得エラー`,
      meta,
    );
    return;
  }
  if (severity === "expired") {
    await notifyDiscord(
      "error",
      `[cert:${result.host}] 期限切れ — 即座に証明書を更新`,
      meta,
    );
    return;
  }
  if (severity === "critical") {
    await notifyDiscord(
      "error",
      `[cert:${result.host}] 残り ${result.daysUntilExpiry} 日 — 7 日以内に期限切れ`,
      meta,
    );
    return;
  }
  // warn
  await notifyDiscord(
    "warn",
    `[cert:${result.host}] 残り ${result.daysUntilExpiry} 日 — 更新検討推奨`,
    meta,
  );
}

/** 1 回分の cert check を実行する（DB 書き込み + 必要ならアラート）。手動 probe からも流用可能。 */
export async function runCertCheckOnce(
  host: string,
  memory?: AlertMemory,
): Promise<CertExpiryResult> {
  const result = await checkCertExpiry(host);
  await persistCertResult(result);
  if (memory) {
    try {
      await maybeAlert(result, memory);
    } catch (err) {
      console.error(
        "[cert-checker] maybeAlert threw:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return result;
}

/**
 * cert checker を起動する（多重起動防止）。
 * `CERT_CHECK_TARGETS` が空、または `HEALTH_CHECK_ENABLED !== 'true'` の時は起動しない。
 * health poller と同じ起動フックから呼ぶため、env は両方まとめて有効化する運用を想定。
 */
export function startCertChecker(): void {
  if (process.env.HEALTH_CHECK_ENABLED !== "true") {
    console.info("[cert-checker] HEALTH_CHECK_ENABLED != 'true'. skip");
    return;
  }
  const g = globalThis as GlobalWithCert;
  if (g.__boundaryPortalCertChecker__?.started) {
    console.info("[cert-checker] already started (skip re-init)");
    return;
  }

  const hosts = parseCertTargets(process.env.CERT_CHECK_TARGETS);
  if (hosts.length === 0) {
    console.info(
      "[cert-checker] CERT_CHECK_TARGETS が空のため起動せず終了（cert 監視を無効化）",
    );
    return;
  }

  const hours = parseCertIntervalHours(process.env.CERT_CHECK_INTERVAL_HOURS);
  const intervalMs = hours * 60 * 60 * 1000;
  const alertMemory: AlertMemory = new Map();

  console.info(
    `[cert-checker] starting with ${hosts.length} host(s), interval ${hours}h:`,
    hosts.join(", "),
  );

  const timers: NodeJS.Timeout[] = [];
  for (const host of hosts) {
    // 初回は 10 秒遅延させて health poller と起動タイミングをずらす
    const first = setTimeout(() => {
      void runCertCheckOnce(host, alertMemory);
      const loop = setInterval(() => {
        void runCertCheckOnce(host, alertMemory);
      }, intervalMs);
      timers.push(loop);
    }, 10_000);
    timers.push(first);
  }

  g.__boundaryPortalCertChecker__ = { started: true, timers, alertMemory };
}
