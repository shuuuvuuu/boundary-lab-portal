/**
 * Next.js instrumentation hook.
 * Phase D-1b: Node ランタイム起動時に health poller を起動する。
 * Phase D-1 (boundary 自己監視): TLS 証明書期限チェッカーも同時起動する。
 *
 * Next.js 15 以降、instrumentation.ts はデフォルトで有効
 * （experimental.instrumentationHook 設定不要）。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ startHealthPoller }, { startCertChecker }] = await Promise.all([
      import("./src/lib/health-poller"),
      import("./src/lib/cert-checker"),
    ]);
    startHealthPoller();
    startCertChecker();
  }
}
