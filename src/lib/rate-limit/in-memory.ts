// NOTE: シングルプロセス前提の in-memory 実装。複数インスタンス (Vercel Edge /
// K8s 複製 Pod / Next.js dev HMR) ではバケットが分散するため本番化前に
// Upstash Redis 等へ差し替えること（計画 Phase B-2）。globalThis に Map を
// 固定し、HMR による sweeper 重複を防止する。
type Bucket = { count: number; resetAt: number };

type Store = {
  buckets: Map<string, Bucket>;
  sweeper: NodeJS.Timeout | null;
};

const globalStore = globalThis as unknown as { __boundaryRateLimit?: Store };
const store: Store =
  globalStore.__boundaryRateLimit ?? (globalStore.__boundaryRateLimit = { buckets: new Map(), sweeper: null });
const buckets = store.buckets;

function ensureSweeper() {
  if (store.sweeper) return;
  store.sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
  store.sweeper.unref?.();
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  ensureSweeper();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return { ok: true, remaining: max - 1, resetAt: fresh.resetAt };
  }

  if (bucket.count >= max) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { ok: true, remaining: max - bucket.count, resetAt: bucket.resetAt };
}
