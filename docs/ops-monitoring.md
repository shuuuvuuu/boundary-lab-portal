# /admin/ops 運用監視（Phase D-1）

Boundary LAB Portal の `/admin/ops` 配下の運用監視機能リファレンス。

## 概要

| タブ | データソース | 目的 |
| ---- | ------------ | ---- |
| 未解決 Issues | Sentry Issues API | 未解決 error / warn issue の一覧と詳細 |
| Logs | Sentry Events API | pino → Sentry の timeline (warn/error) |
| Uptime | Supabase `service_health_checks` | 外部 health check ポーリング履歴 |

いずれも owner email (`OWNER_EMAILS`) のみアクセス可。UI は URL クエリ `?tab=uptime&service=rezona` で共有可能。

## Phase D-1a: Sentry サービスタブ (boundary / rezona 切替)

### 必要な env

```bash
# 共通
SENTRY_AUTH_TOKEN=sntryu_xxxxx      # Personal Token (sntrys_ では Issue API が叩けない点に注意)
SENTRY_ORG=shuu-dw

# boundary (既存)
SENTRY_SERVER_PROJECT=boundary-metaverse-server
SENTRY_WEB_PROJECT=boundary-metaverse-web

# rezona (Phase D-1a 追加)
SENTRY_REZONA_PROJECTS=rezona-server,rezona-web   # カンマ区切り
# 以下は共通 token / org で足りれば省略可
# SENTRY_REZONA_AUTH_TOKEN=
# SENTRY_REZONA_ORG=
```

`SENTRY_REZONA_PROJECTS` が空の場合、rezona タブ選択時に「未設定」メッセージが表示される（エラーにはならない）。

### 切替方法

OpsTabs 右上の `Sentry Service: boundary | rezona` セレクタで切替。URL に `?service=rezona` が付与される。

## Phase D-1b: 外部 Health Check Polling

### アーキテクチャ

```
instrumentation.ts
  └ startHealthPoller()
      ├ setInterval で各 target を fetch (5s timeout)
      ├ Supabase service_health_checks に INSERT (service_role)
      └ evaluateAndAlert()
            └ Discord Webhook (連続失敗時のみ)
```

### 必要な env

```bash
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/api/healthz|60;rezona|https://rezona-backend.onrender.com/api/health|60

# Supabase service_role (health poller の INSERT / uptime API の SELECT 両方で必要)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

フォーマットは `service|url|interval_seconds` をセミコロン区切り。`interval_seconds` 未指定は 60、30 未満は自動で 30 に丸める。

### DB スキーマ適用

```bash
# Supabase Dashboard → SQL Editor から実行するか、CLI で
supabase db push
# あるいは psql で
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260424000001_service_health_checks.sql
```

テーブル `public.service_health_checks` が存在しているかで確認できる。RLS 有効・policy なしなので、`service_role` 以外からは全拒否。

### Uptime タブの見方

- **稼働率**: 指定期間内の ok 件数 / 総件数
- **平均応答時間**: ok レコードのみで平均
- **最終成功 / 失敗**: DESC 先頭
- **応答時間バーチャート**: 左が古い、右が新しい。赤＝失敗（status_code ≥ 400 or fetch error）
- **履歴テーブル**: 直近 100 件、JST 表示

`今すぐ確認` ボタンは `POST /api/admin/ops/probe?service=...` を叩いて 1 回分の probe を即実行。rate limit は 5req/60s。

## Phase D-1c: Discord 連続失敗アラート

### 挙動

| 条件 | アラート | level |
| ---- | -------- | ----- |
| 直近 3 件が連続失敗 | `[service] DOWN` | error |
| 前回 DOWN から 10 分以内 | （抑制） | — |
| 直近 1 件が成功かつ前回 DOWN から 60 秒以上経過 | `[service] RECOVERED` | info |

`DISCORD_WEBHOOK_URL` 未設定時は `[discord-alert disabled]` console log のみ（本番エラーにはならない）。

alert の state は process メモリに保持されるため、Portal 再起動直後は再度 DOWN を送る可能性がある。

## デプロイ手順（Droplet）

`/admin/ops` を含む portal を Droplet `159.223.35.150` にデプロイする手順:

```bash
# 1. env を Droplet に同期（HEALTH_CHECK_* / SENTRY_REZONA_* を追加）
#    .env.local に書くか、docker compose の env_file で読み込ませる

# 2. DB migration
supabase db push         # またはダッシュボード SQL Editor で 20260424000001_service_health_checks.sql を実行

# 3. Droplet で pull & rebuild
ssh root@159.223.35.150 "cd /opt/boundary-lab-portal && \
  git fetch && git checkout feat/phase-d1-rezona-monitoring && git pull && \
  docker compose up -d portal --force-recreate"

# 4. ログで poller 起動を確認
docker compose logs -f portal | grep health-poller
# => [health-poller] starting with 1 target(s): boundary(https://..., 60s)
```

## 動作確認チェックリスト

- [ ] `.env.local` に `HEALTH_CHECK_ENABLED=true` と `HEALTH_CHECK_TARGETS=boundary|...|60` のみ設定
- [ ] `SUPABASE_SERVICE_ROLE_KEY` が設定されている
- [ ] migration が本番 Supabase に適用済み
- [ ] `npm run build` がエラーなく完了
- [ ] `/admin/ops?tab=uptime` に boundary が表示される
- [ ] 60 秒待って履歴テーブルに 1 行追加される
- [ ] 「今すぐ確認」ボタンで即時 1 行追加
- [ ] `HEALTH_CHECK_TARGETS` を `http://localhost:9/bad` のような必ず失敗する URL に置換し、3 回連続失敗後に Discord に `[service] DOWN` が届く
- [ ] 復旧 URL に戻して、60 秒以上経過後に RECOVERED が届く
- [ ] rezona env 未設定でも Issues / Logs タブが boundary は正常動作、rezona 選択時は「未設定」表示

## 追加 API 一覧

| Method | Path | 説明 | RateLimit |
| ------ | ---- | ---- | --------- |
| GET | `/api/admin/ops/uptime?service=&hours=` | 履歴 + サマリ | 30 / 60s |
| POST | `/api/admin/ops/probe?service=` | 即時 probe 実行 | 5 / 60s |
| GET | `/api/admin/sentry/issues?service=` | Issue 一覧 | 10 / 60s |
| GET | `/api/admin/sentry/issues/[id]?service=` | Issue 詳細 | 20 / 60s |
| GET | `/api/admin/sentry/events?service=&level=` | Log events | 10 / 60s |
