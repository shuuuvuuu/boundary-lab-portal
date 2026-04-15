# Boundary LAB ポータル 認証・API保護 ハードニング計画

**作成日**: 2026-04-15
**承認**: 代表 (2026-04-15)
**着手**: 別実装完了後
**Why**: rezonaリポジトリの認証・送金基盤調査から導かれた4つのパターン採用。Privyへの移行は不要（B2B用途で年¥54万コスト発生 + 顧客にウォレット概念は不適合）と判断、代わりに「再利用可能なミドルウェア + Rate Limit + 安全弁 + 運用アラート」をSupabase Authの上に積む方針。

---

## Phase A: 認証ミドルウェア共通化（最優先）

### 現状の課題
- `src/app/api/calendar/route.ts` `src/app/api/calendar/[id]/route.ts` で `supabase.auth.getUser()` + 401返却が手書きで重複
- 新規API追加時にチェックを書き忘れるリスクあり
- `plan_tier` (free/standard/professional/enterprise) を将来チェックする予定だが、共通基盤がないと各Routeに散らばる

### 実装タスク
1. **`src/lib/auth/with-auth.ts` 新規作成** — Route Handlerラッパー
   ```ts
   export function withAuth<T>(
     handler: (req: NextRequest, ctx: { user: User; supabase: SupabaseClient }) => Promise<T>
   ): (req: NextRequest) => Promise<NextResponse>
   ```
   - 内部で `createClient()` → `getUser()` → 未認証時 401 自動返却
   - 認証済み時のみ handler を呼び、user/supabase を注入

2. **`src/lib/auth/with-tier.ts` 新規作成** — プラン階層チェック
   ```ts
   export function withTier(minTier: 'standard'|'professional'|'enterprise', handler) { ... }
   ```
   - DB から `plan_tier` を引き、不足時 403
   - 「最上位プランで運営タブ解放」要件（memory: project_boundary_portal）の実装基盤

3. **既存API移行**
   - `src/app/api/calendar/route.ts` → `withAuth` でラップ
   - `src/app/api/calendar/[id]/route.ts` → 同上
   - 行数削減 + 漏れ防止

### 参考実装
rezona `server/middleware/auth.ts` の `requireAuth` / `optionalAuth` パターン。Express版なのでNext.js App Router用に書き直す必要あり。

---

## Phase B: Rate Limit 導入

### 現状の課題
- 全APIに rate limit なし
- Magic Link OTP送信エンドポイント（Supabase側で多少緩和されるが）への大量送信攻撃リスク
- 将来の決済API・運営タブAPIに必須

### 実装タスク
1. **`src/lib/rate-limit/in-memory.ts` 新規作成** — IPベース rate limit (rezona方式の移植)
   ```ts
   const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
   export function checkRateLimit(ip: string, max: number, windowMs: number): boolean
   ```
   - 1分ごとに `setInterval` で古いエントリ掃除
   - **注意**: Vercel Edge/Serverless環境ではインスタンス間で状態共有されないため、Phase B-2 で Upstash Redis 等への切替を計画

2. **`withRateLimit(opts)` ラッパー作成** — `withAuth` と合成可能
   ```ts
   withRateLimit({ max: 10, windowMs: 60_000 }, withAuth(handler))
   ```

3. **適用対象**
   - `/api/calendar/*` — 60req/分
   - 将来の `/api/billing/*` — 10req/分
   - `/login` のOTP送信 — Supabase設定でも併せて確認（IP制限等）

### 将来の置き換え (Phase B-2)
本番化フェーズで Upstash Redis または Vercel KV にバックエンド差し替え。インターフェース (`checkRateLimit`) を変えなければ呼び出し側修正不要にしておく。

### 参考実装
rezona `server/api/relay-transfer.ts` L8-29

---

## Phase C: 決済実装時の安全弁三点セット

### 適用タイミング
Stripe Subscription 実装フェーズ（決済プロバイダ統合時に併せて）

### 実装タスク
1. **金額上限 envガード**
   ```ts
   const MAX_INVOICE_AMOUNT_JPY = parseInt(process.env.MAX_INVOICE_AMOUNT_JPY ?? '500000');
   ```
   - Stripe Checkout Session 作成時に検証
   - 実装ミス・envミスで¥10万円以上の請求が走るリスクを構造的に防ぐ

2. **有効期限 (expiry) 必須化**
   - Stripe Checkout Session の `expires_at` を24時間以内に必ず設定
   - 古い payment intent の使い回しによる二重課金リスクを排除

3. **Idempotency Key 必須化**
   - Stripe SDK 呼び出しに `idempotencyKey: crypto.randomUUID()` を必須化
   - リトライ・ネットワーク再送による二重課金を防止

### 参考実装
rezona `server/api/relay-transfer.ts` L31-86 の3点セット (MAX_AMOUNT_WEI / validBefore / nonce) と同じ思想を法定通貨決済に翻訳したもの。

---

## Phase D: Discord 運用アラート

### 適用タイミング
Phase A〜C のいずれかの実装と同時、または最低限Phase Cの完了直後

### 実装タスク
1. **`src/lib/alerts/discord.ts` 新規作成**
   ```ts
   export async function notifyDiscord(level: 'info'|'warn'|'error', message: string, meta?: object)
   ```
   - `process.env.DISCORD_WEBHOOK_URL` にPOST
   - level別に色分け（embed.color）

2. **アラート対象**
   - Stripe webhook 失敗
   - Supabase 接続失敗（特定回数連続）
   - 最上位プラン顧客のAPIエラー（優先度高）
   - Rate Limit 連続発火（攻撃の可能性）
   - Magic Link 送信失敗 spike

### 参考実装
rezona `server/lib/discord-alert.ts`（Relayer残高アラート用パターン）

---

## 環境変数追加リスト

```env
# Phase C
MAX_INVOICE_AMOUNT_JPY=500000

# Phase D
DISCORD_WEBHOOK_URL=
```

---

## 着手順序（推奨）

| 順 | Phase | 工数感 | 依存 |
|---|---|---|---|
| 1 | **A: 認証ミドルウェア共通化** | 半日 | なし |
| 2 | **B: Rate Limit (in-memory版)** | 半日 | A完了後だと合成しやすい |
| 3 | **D: Discord アラート (基盤のみ)** | 1〜2時間 | なし |
| 4 | **C: 安全弁三点セット** | Stripe実装と同時 | Stripe導入時 |
| 5 | **B-2: Rate Limit Redis化** | 半日 | 本番化フェーズ |

Phase A・B・D は **独立して着手可能、合計1.5日程度**。Phase C は決済実装フェーズに巻き込んで一緒にやる。

---

## やらないこと（スコープ外）

- ❌ **Privy移行** — Boundary LAB B2B規模で年¥54万のコスト発生 + 顧客にウォレット不要 → 不採用 (2026-04-15判断)
- ❌ **Web3ウォレット接続** — 現時点でユースケースなし。将来必要になったら wagmi + RainbowKit を Supabase Auth と併用すれば無料
- ❌ **EIP-3009 / 暗号通貨決済** — B2B法人顧客は請求書払い・カード決済が前提。rezona方式は不適合
