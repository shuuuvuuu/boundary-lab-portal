import type { CronJob } from "@/lib/scheduler/types";

/**
 * airdrop-dry-run: rezona の airdrop を **dry-run** で検証する。
 *
 * 制約:
 *   - rezona 本番状態は触らない (rezona-admin 等の API は呼び出さない)
 *   - portal 側からは read-only health check として GET でのみ呼ぶ
 *   - rezona が dry-run 用 read-only endpoint を提供していない時は 404 を許容して
 *     "endpoint not provided" として ok を返す
 *
 * env:
 *   REZONA_AIRDROP_DRYRUN_URL — 未設定時は no-op で ok を返す
 *   REZONA_INTERNAL_SECRET    — Bearer token (任意)
 *
 * 将来 rezona 側が `/api/admin/airdrop/dry-run` を実装したら自動で意味が出るようにしておく。
 */
export const airdropDryRunJob: CronJob = {
  kind: "cron",
  name: "airdrop-dry-run",
  description: "毎日 UTC 04:00: rezona airdrop dry-run の health 確認 (read-only)",
  schedule: { type: "daily", hourUtc: 4, minuteUtc: 0 },
  handler: async () => {
    const url = process.env.REZONA_AIRDROP_DRYRUN_URL;
    if (!url) {
      return {
        ok: true,
        message: "REZONA_AIRDROP_DRYRUN_URL 未設定のため dry-run は no-op",
      };
    }

    const secret = process.env.REZONA_INTERNAL_SECRET;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (secret) {
      headers["Authorization"] = `Bearer ${secret}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers,
      });
      const status = res.status;

      // 404 はまだ未実装と解釈、ok 扱い
      if (status === 404) {
        return {
          ok: true,
          message: `endpoint returned 404 (not implemented yet)`,
          meta: { url, status },
        };
      }

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // 非 JSON でもステータスだけで判定する
      }

      if (!res.ok) {
        return {
          ok: false,
          message: `dry-run endpoint returned ${status}`,
          meta: { url, status, body },
        };
      }
      return {
        ok: true,
        message: `dry-run endpoint returned ${status}`,
        meta: { url, status, body },
      };
    } catch (err) {
      return {
        ok: false,
        message: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        meta: { url },
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
