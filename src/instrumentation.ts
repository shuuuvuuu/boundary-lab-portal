/**
 * Next.js instrumentation hook.
 * Phase D-1b: Node ランタイム起動時に health poller を起動する。
 * Phase D-1 (boundary 自己監視): TLS 証明書期限チェッカーも同時起動する。
 * Phase A3:    cron / scheduled job ランナーも同時起動する。
 *
 * Next.js 15 以降、instrumentation.ts はデフォルトで有効
 * （experimental.instrumentationHook 設定不要）。
 *
 * 注: src/app/ を使う src-dir モードでは src/instrumentation.ts に置く必要あり。
 * repo 直下の instrumentation.ts は検出されず、コンパイルもされない。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [
      { startHealthPoller },
      { startCertChecker },
      { startJobRunner },
      { JOBS },
    ] = await Promise.all([
      import("@/lib/health-poller"),
      import("@/lib/cert-checker"),
      import("@/lib/scheduler/runner"),
      import("@/lib/jobs"),
    ]);
    startHealthPoller();
    startCertChecker();
    startJobRunner(JOBS);
  }
}
