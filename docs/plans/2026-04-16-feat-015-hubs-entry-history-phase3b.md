# Feat-015 Phase 3b: Hubs 入室履歴収集 WS サイドカー 技術仕様書

**ステータス**: 確定（実装待ち）
**作成日**: 2026年04月16日
**バージョン**: v1.0（代表承認済）
**作成者**: テックエンジニア（技術実装部）
**プロジェクト**: Boundary LAB ポータル Feat-015 / Phase 3b
**クライアント**: 社内（Boundary LAB 運営）

---

## 1. システム概要

### 目的・解決する課題

Reticulum（Hubs Foundation のバックエンド）は Phoenix.Presence によるルーム在室情報を WebSocket でブロードキャストするのみで、入退室履歴を永続化しない。Phase 3a で Hubs account との静的な紐付けは完了しているため、本 Phase では「誰がいつどのルームに入り、いつ出たか」を恒久的に記録するサイドカーを立て、Feat-014 運営ダッシュボードの 7 列統計（月間利用日数・延べ人時・UU・同時接続ピーク等）の一次データソースとする。

### 主要機能

- Reticulum の `wss://<host>/socket/websocket?vsn=2.0.0` に bot account として常時接続し、監視対象ルームの `hub:<hub_sid>` チャンネルを join
- `presence_state`（full snapshot）と `presence_diff`（joins/leaves 差分）を受信
- 入退室イベントを Supabase `room_entry_events` テーブルに書き込み
- WS 切断時の指数バックオフ再接続 + 再接続直後の snapshot 差分解決
- 障害検知時に Discord webhook で通知（既存 `lib/discord/alert.ts` 流用）

### スコープ外（このシステムが担当しないもの）

- ルーム内の発言・チャット・音声内容の記録（法的リスクのため明示的に除外）
- mediasoup 経由の通信量計測（Phase B = mediasoup-exporter sidecar の責務）
- Hubs account を持たない anonymous ユーザーの名寄せ（session_id ベースで別レコードとして記録するのみ）
- リアルタイム配信 API の提供（ダッシュボードは 5 分〜日次の遅延集計で十分）

---

## 2. 技術スタック

| カテゴリ | 使用技術 | バージョン | 選定理由 |
|---------|---------|-----------|---------|
| 言語 | Node.js | v20 LTS | ポータル本体と統一、phoenix client の実績 |
| WS クライアント | `phoenix` (npm) | v1.7.x | Reticulum クライアント本体と同一プロトコル、公式 |
| DB クライアント | `@supabase/supabase-js` | v2.x | 既存ポータルと同じ、service_role 前提 |
| ランタイム | Docker コンテナ | — | K8s に Deployment として載せる |
| ログ | pino (JSON) | v9.x | DO Monitoring で集約しやすい |

---

## 3. システムアーキテクチャ

### ホスティング先の結論

**DO K8s の既存 `hcce` namespace 内に別 Deployment として配置する。**

#### 判断根拠

| 観点 | `hcce` 同居 Deployment | 別 namespace（`bl-sidecar` など） | 別クラスタ / Vercel Functions |
|---|---|---|---|
| reticulum への接続 | ClusterIP 経由で `ws://reticulum.hcce.svc.cluster.local:4000/socket` が使える。外部 TLS 不要 | NetworkPolicy を書けば可能 | 外部 wss 必須、bot アカウントで TLS 越し join |
| 運用の一元化 | 既存 `kubectl -n hcce` ワークフローで完結 | 追加 namespace 管理 | 別基盤の監視/alert を用意 |
| 障害影響範囲 | reticulum 停止時は同時に止まり、状態一致が自然 | 同上 | reticulum 死亡を知る経路が別途必要 |
| リソース競合 | `s-4vcpu-8gb` ノード上で reticulum/haproxy と RAM を取り合う可能性 | 別プール化する場合ノード追加コスト | — |
| 設定複雑度 | 低（既存 Secret から `RETICULUM_BOT_ACCESS_KEY` を共有） | 中 | 高 |

メモリ ref `reference_hubs_foundation_ce_sizing.md` に記載のとおり現行 8GB ノードは haproxy 2Gi 確保後 3〜3.5GB 余裕しかないが、本サイドカーの想定 RSS は **100〜200MB（Node.js + 1 WS 接続 + バッファ）** で、haproxy OOM 問題を誘発しない範囲に収まる。したがって**同 `hcce` namespace に別 Deployment** とし、`replicas: 1` 固定で運用する。Reticulum 側の接続数・負荷観点でも bot 1 接続が増えるだけで誤差。

### 構成図

```
[Reticulum Pod (Phoenix)]  ←── hcce cluster ──
      │ wss://reticulum:4000/socket (ClusterIP)
      │   phx_join "hub:<hub_sid>"
      │   presence_state / presence_diff
      ▼
[hubs-entry-sidecar Deployment  (new, hcce ns, replicas:1)]
      │ Supabase REST (service_role)
      ▼
[Supabase project: room_entry_events テーブル]
      │
      ├──► Feat-014 AdminTab (遅延集計 SQL)
      └──► 日次バッチ（Phase C の按分コスト計算）
```

### データフロー

1. **起動**: `RETICULUM_WS_URL` に vsn=2.0.0 で接続 → `phoenix` Socket を open
2. **監視対象ルーム列挙**: 起動時に reticulum DB を読み、`hubs` テーブルから `entry_mode != 'deny' AND NOT soft_deleted` の hub_sid 全件を取得（Phase 3a の `RETICULUM_DB_URL` 読み取り専用ロールを流用）
3. **join**: 各 hub_sid について `hub:<hub_sid>` チャンネルを join。`profile` `context` `perms_token`（後述）を payload に含む
4. **snapshot**: `presence_state` イベント受信時、現時点で在室中のセッションを「open entry」として扱う（重複 insert は `ON CONFLICT DO NOTHING`）
5. **diff**: `presence_diff` イベントを受けて `joins` は INSERT、`leaves` は直近の open entry に `left_at` を UPDATE
6. **閉じ忘れ対策**: 起動時に「前回起動中に left_at が NULL のまま 24h 以上経過しているレコード」を `left_at = last_seen_at, closed_reason = 'stale_on_boot'` で強制クローズ

---

## 4. 環境変数・設定

| 変数名 | 説明 | 必須 | 例 |
|--------|------|------|-----|
| `RETICULUM_WS_URL` | 内部 WS エンドポイント | 必須 | `ws://reticulum.hcce.svc.cluster.local:4000/socket` |
| `RETICULUM_DB_URL` | ルーム列挙用 read-only ロール（Phase 3a と共有） | 必須 | `postgres://ro_user:xxx@...` |
| `RETICULUM_BOT_ACCESS_KEY` | perms_token 発行用の bot account 秘密鍵 | 必須 | `ret-bot-xxxx` |
| `SUPABASE_URL` | Supabase プロジェクト URL | 必須 | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | サービスロールキー（書き込み用） | 必須 | `eyJ...` |
| `DISCORD_ALERT_WEBHOOK_URL` | 障害通知用 | 必須 | `https://discord.com/api/webhooks/...` |
| `SIDECAR_LOG_LEVEL` | pino log level | 任意 | `info` |
| `SIDECAR_RECONNECT_MAX_MS` | 再接続バックオフ上限（ms） | 任意 | `60000` |

`.env` はローカル開発のみ。本番は K8s Secret `hubs-entry-sidecar-env` に格納し Deployment から `envFrom` で注入する。

---

## 5. 機能仕様

### 機能1: Reticulum への接続と認証

**概要**: bot account で Phoenix Socket を常時 open し、監視対象ルームへ join する。

**認証方式**:

- hubs-discord-bot 公式実装と同じく **`RETICULUM_BOT_ACCESS_KEY`（Reticulum の `PERMS_KEY` 派生の bot 用鍵）で perms_token（JWT）を発行**し、join payload の `perms_token` に載せる
- bot account は Reticulum DB 上に「サイドカー専用 identity」として 1 件作成する（display_name = `entry-history-bot`）。通常ユーザーとして list に出ないよう `profile.display_name` は識別可能な固定値とし、ダッシュボード集計側で除外フィルタをかける
- 保護ルーム（`entry_mode: "allow"` の closed room）への join 可否: **Phase 3b のスコープでは対応しない**。bot account を全 hub に invite するのはオペレーションコストが高いため、`entry_mode = 'allow'` ルームはサイドカーから除外し、運営タブ側で「非公開ルームは履歴未取得」を明示する

**入力**: 環境変数のみ

**処理フロー**:
1. `new Socket(RETICULUM_WS_URL, { params: { vsn: "2.0.0" }})` で接続
2. open 成功 → DB から対象 hub_sid 列挙
3. 各 hub_sid に `socket.channel("hub:" + sid, { perms_token, profile, context })` で join
4. join 失敗（`phx_error`）はログ + Discord 通知、当該ルームは指数バックオフで再試行

**バリデーション**:
- hub_sid の形式（7 文字 base62）を正規表現でチェックし、不正な値は skip
- perms_token の発行は起動時と 6 時間ごとにリフレッシュ（JWT 有効期限 24h 想定の余裕）

---

### 機能2: イベント収集（join / leave）

**収集する粒度**:

| フィールド | 取得元 | 備考 |
|---|---|---|
| `hub_id` | channel topic | Reticulum 側 hub_sid。`hubs.hub_sid` と対応 |
| `session_id` | presence key | Phoenix が発行する一時 ID |
| `reticulum_account_id` | `meta.profile.id` or `meta.account_id` | null 可（anonymous） |
| `hubs_account_id` | Supabase `profiles.hubs_account_id` 逆引き | バッチ側で解決してもよい |
| `display_name` | `meta.profile.displayName` | PII 最小化のため保存しない選択肢もあり（§7） |
| `anon_id` | account_id が無い場合の `session_id` 全体 | UU 集計用 |
| `entered_at` | サイドカー受信時刻（UTC） | `presence_state` の場合は起動時刻を代入し `source = 'snapshot'` |
| `left_at` | leave 受信時刻（UTC） | 未確定時は NULL |
| `source` | `'diff'` / `'snapshot'` / `'stale_on_boot'` | データ由来 |

**presence diff の扱い**:

- `joins`: 当該 session_id の未クローズレコードが既にあれば skip（snapshot → diff 重複）
- `leaves`: 当該 session_id の最新の open entry に `left_at` を UPDATE
- meta の `presence` が `"lobby"` → `"room"` に変わる transition は update イベントだが、**本 Phase では room 突入とは区別せず無視**（実入室は最初の join で確定済み）
- 同一 account_id の multi-tab による重複 session は **行としてはそのまま記録**し、UU 集計クエリ側で `DISTINCT reticulum_account_id` で潰す

---

### 機能3: 障害リカバリ

**WS 切断時の再接続戦略**:

1. `phoenix` Socket の `onClose` / `onError` で検知
2. 指数バックオフ（1s → 2s → 4s → ... → 最大 `SIDECAR_RECONNECT_MAX_MS`）で再試行
3. 再接続成功時、**すべてのチャンネルを再 join** し、`presence_state` を再取得
4. 再取得した snapshot 内で「DB に open entry があるが snapshot に session_id が無い」 → 切断中に leave が起きたとみなし、`left_at = 切断検知時刻, closed_reason = 'reconnect_reconcile'` でクローズ
5. 逆に「DB に無いが snapshot にある session_id」 → 切断中の join、`source = 'reconnect_reconcile'` で INSERT（`entered_at` は snapshot 受信時刻、真の入室時刻は不明として flag）

**欠損検知**:
- 1 分ごとのハートビート: socket 未接続が 2 分続いたら Discord に warning
- 日次バッチ: `entered_at < now - 24h AND left_at IS NULL` の件数を監視、閾値超過で alert

**補填の要否**:
- Reticulum 自体が履歴を持たないため**完全補填は不可能**。サイドカー停止中の入退室は欠損を許容し、`closed_reason = 'stale_on_boot'` の件数を SLI として観測する運用とする
- 厳密な SLA が必要になった段階で reticulum 側に Telemetry handler を追加する別 Phase（3c 相当）を検討

---

## 6. データベース設計

### Supabase スキーマ案

```sql
-- room_entry_events: 1 行 = 1 セッションの入退室対
create table public.room_entry_events (
  id bigserial primary key,
  hub_id text not null,                            -- hub_sid (7 char base62)
  session_id text not null,                        -- Phoenix presence key
  reticulum_account_id text,                       -- 可能なら紐付け、nullable
  hubs_account_id uuid references public.profiles(hubs_account_id),
                                                   -- Phase 3a で紐付け済みなら
  display_name text,                               -- §7 検討：保存しない案もあり
  anon_id text,                                    -- account_id 欠如時の UU キー
  entered_at timestamptz not null,
  left_at timestamptz,                             -- null = 在室中 or 欠損
  source text not null check (source in ('diff','snapshot','reconnect_reconcile','stale_on_boot')),
  closed_reason text,                              -- 'leave_diff','reconnect_reconcile','stale_on_boot',null
  meta_snapshot jsonb,                             -- デバッグ用 meta 原文（保持期間 30 日で削除）
  created_at timestamptz not null default now()
);

create index room_entry_events_hub_entered_idx
  on public.room_entry_events (hub_id, entered_at desc);
create index room_entry_events_open_idx
  on public.room_entry_events (hub_id, left_at)
  where left_at is null;
create index room_entry_events_account_entered_idx
  on public.room_entry_events (hubs_account_id, entered_at desc)
  where hubs_account_id is not null;
create unique index room_entry_events_open_session_unique
  on public.room_entry_events (hub_id, session_id)
  where left_at is null;                           -- 同じセッションの二重オープン防止
```

### RLS 方針

- `alter table public.room_entry_events enable row level security;`
- **サイドカーは `service_role` キーで書き込み**（RLS bypass）
- **Feat-014 運営タブからの参照**は既存 `colleague` / `enterprise` plan_tier の判定を使う。メモリ `reference_supabase_rls_self_reference.md` の教訓に従い、`profiles` を USING 句で直接 SELECT せず SECURITY DEFINER 関数経由で plan_tier を評価する:

```sql
create policy "admin read room_entry_events"
  on public.room_entry_events for select
  using (public.current_user_is_admin());  -- SECURITY DEFINER で定義
```

- 個人情報保護: `display_name` と `meta_snapshot` は admin のみ参照。将来的に個人に自分の入室履歴を見せる場合は別 view（`hubs_account_id = auth.uid()` で紐付けたカラムのみ）を切る

### 保持期間

- `room_entry_events` 本体: 24 ヶ月（営業資料の年次比較のため）
- `meta_snapshot` カラム: 30 日経過で `UPDATE ... SET meta_snapshot = NULL`（pg_cron で夜間）
- ガイドライン §2「無期限保持禁止」準拠

---

## 7. セキュリティ設計

### セキュリティチェックリスト（必須 4 項目）

1. **API キー管理**
   - `RETICULUM_BOT_ACCESS_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `RETICULUM_DB_URL` はすべて K8s Secret（`hubs-entry-sidecar-env`）で管理し、マニフェストにはハードコードしない
   - Secret は `kubectl create secret --from-env-file` で作成、Git には `.env.example` のみコミット
   - CI/CD からは GitHub Actions → DO K8s の Secret 書き込み経路を設け、ローカル `.env` とは別系統で管理

2. **入力値バリデーション**
   - hub_sid は `/^[A-Za-z0-9]{7}$/` で検証、不正値は DB に到達させない
   - `meta` 内のフィールドは `typeof` チェック + 文字数上限（`display_name` 最大 64 文字、超過時 truncate）
   - Supabase への INSERT は supabase-js の parameterized 経由のみ、生 SQL 連結禁止

3. **外部送信範囲**
   - サイドカーから外部へ出る通信は **Supabase REST** と **Discord Webhook** の 2 経路のみ
   - Discord Webhook には PII（display_name, email, account_id 等）を送らない。送る情報は `hub_id`（先頭 4 文字マスク）、エラー種別、件数、タイムスタンプのみ
   - Reticulum は ClusterIP で Pod 内通信に閉じる

4. **エラー時挙動**
   - 例外は必ず catch し、WS 切断で process 全体を落とさない
   - ただし Supabase 認証エラー（401/403）や `RETICULUM_BOT_ACCESS_KEY` invalid のような「構成不備」系は**早期に fail fast**（起動後 3 分以内）で Pod を crash させ、K8s の restart loop で可視化する
   - エラーメッセージには Secret 値・perms_token・session_id の全文を含めない（`session_id.slice(0,4)+"***"` にマスク）

---

## 8. Feat-014 ダッシュボードとの整合性

Feat-014 最終形 7 列を `room_entry_events` 単独で支えられるかの検証:

| 列 | 集計クエリ概要 | 可否 |
|---|---|---|
| ルーム名 | `hubs` テーブル join（Phase 3a 流用） | 可 |
| 月間利用日数 | `COUNT(DISTINCT date_trunc('day', entered_at))` | 可 |
| 延べ人時 | `SUM(EXTRACT(EPOCH FROM (left_at - entered_at))/3600)`（left_at null は除外 or 当日 23:59 で代入） | 可 |
| 同時接続ピーク | window function で gaps-and-islands or 1 分粒度 tick テーブルと join | 可（重め） |
| UU | `COUNT(DISTINCT COALESCE(reticulum_account_id, anon_id))` | 可 |
| 推定通信量(MB) | mediasoup-exporter（Phase B）データが必要 | **不可・別 Phase 依存** |
| 推定按分コスト(円) | DO egress × 人時比 | Phase C で計算 |

結論: **5/7 列は `room_entry_events` のみで成立**、残り 2 列は Phase B/C に明示依存。ダッシュボード SQL は Supabase 側の materialized view として別 Phase で整備する。

---

## 9. 運用・保守

### セットアップ手順（運用担当向け）

```bash
# 1. Secret 作成（初回のみ）
kubectl -n hcce create secret generic hubs-entry-sidecar-env \
  --from-env-file=./prod.env

# 2. Deployment 適用
kubectl -n hcce apply -f k8s/hubs-entry-sidecar.yaml

# 3. 起動ログ確認
kubectl -n hcce logs -l app=hubs-entry-sidecar -f
```

### 監視・アラート

- K8s liveness probe: 内部 HTTP `/healthz`（WS 未接続が 2 分以上 → 500）
- DO Monitoring: Pod restart 回数 >3/h で Slack
- Supabase 側日次 SQL: `stale_on_boot` 件数、open entries > 24h 件数

### コスト見積もり（月次）

| サービス | 想定使用量 | 月額費用 |
|---------|-----------|--------------|
| K8s Pod（既存ノード相乗り） | 150MB RAM / 10m CPU | 0 円（既存枠内） |
| Supabase 行数 | 10,000 行/月（20 人 × 30 日 × 17 枠想定） | 0 円（free tier 内） |
| Discord Webhook | 数件/日 | 0 円 |
| **合計** | | **0 円（追加費用なし）** |

---

## 10. 想定工数と実装難度

| 項目 | 見積 |
|---|---|
| 実装工数 | **3〜4 人日**（Codex 実装 + テスト + K8s マニフェスト + Supabase migration） |
| 実装難度 | **中**（Phoenix Channel の知見と再接続時の reconcile ロジックが肝。単体 WS クライアントとしては難しくないが「欠損検知 + 冪等性」設計で一段上がる） |
| ブロッキング | なし（Phase 3a 完了済・bot account 作成方針は本計画書で確定） |

---

## 11. 変更履歴

| 日付 | バージョン | 変更内容 | 変更者 |
|------|----------|---------|--------|
| 2026-04-16 | v0.1 | 初版（計画書） | テックエンジニア |

---

## 代表判断事項 (2026-04-16 確定)

以下3点を代表承認済。本計画を v1.0（確定）に昇格。

1. **`display_name` は `room_entry_events` に保存する** — デバッグ・クレーム対応優先。利用規約に「入室履歴を会社が保持」を明文化する対応を別タスクで起票。display_name 変更時は履歴固定（イベント発生時点の値を凍結）
2. **保護ルーム（`entry_mode='allow'`）は Phase 3b のスコープから除外** — 現状どおり公開ルームのみ監視。運営タブに「非公開ルームは履歴未取得」を明示。全ルーム網羅は将来 Phase 3c として別起票
3. **bot account `entry-history-bot` の本番 Reticulum 作成を承認** — Reticulum 管理画面で 1 件作成、JWT/password は portal Secret に登録。Bot 在室表示の UX 影響は集計側でフィルタ除外

---

## 次のアクション: codex:rescue へ実装委譲

本計画書の確定後、以下を codex:rescue に委譲する:

1. `boundary-lab-portal` リポジトリ配下に `services/hubs-entry-sidecar/`（独立 package）を新規作成
2. `src/lib/hubs/sidecar-client.ts` 相当の Phoenix Socket クライアント実装
3. Supabase migration `supabase/migrations/2026xxxx_room_entry_events.sql`
4. K8s マニフェスト `k8s/hubs-entry-sidecar.yaml`（Deployment + Secret + Service ヘッドレス）
5. `.env.example` 更新 + README 追記
6. QA レビュー依頼（型・lint・セキュリティチェックリスト 4 項目）
