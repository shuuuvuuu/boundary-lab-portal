/**
 * Next.js instrumentation hook.
 * Phase D-1b: Node ランタイム起動時に health poller を起動する。
 *
 * Next.js 15 以降、instrumentation.ts はデフォルトで有効
 * （experimental.instrumentationHook 設定不要）。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startHealthPoller } = await import("./src/lib/health-poller");
    startHealthPoller();
  }
}
