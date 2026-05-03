# /admin/ops 運用監視

Boundary LAB Portal の `/admin/ops` 配下にある運用監視機能のリファレンス。

## 概要

| タブ | データソース | 目的 |
| ---- | ------------ | ---- |
| Sync | Supabase `otel_sync_checks` / OTel tables | traces / logs の同期状況と欠落を確認 |
| Logs (OTel) | Supabase `otel_logs` | OTLP で受信した logs の検索と詳細確認 |
| Traces (OTel) | Supabase `otel_traces` / `otel_spans` | trace / span のタイムライン確認 |
| Activity | Supabase `activity_events` | ユーザー操作、API 呼出、サーバー状態遷移を時系列で確認 |
| Metrics | Supabase `service_metrics` | metrics poller が保存したサービス指標を確認 |
| Users | Supabase profiles / auth data | ユーザー状態の確認 |
| Uptime | Supabase `service_health_checks` | HTTP health check と TLS 証明書残日数を確認 |
| Jobs | Supabase `job_runs` | scheduler の登録ジョブと実行履歴を確認 |
| Logs (受信) | Supabase `service_logs` | `/api/logs/ingest` が受けた外部サービス pino ログを確認 |
| TODOs | Supabase `ops_todos` | 運用 TODO の一覧と更新 |

いずれも owner email (`OWNER_EMAILS`) のみアクセス可。`GUEST_OPS_ENABLED=true`
の場合は読み取り中心の運用ビューを未ログインゲストにも公開できる。UI は URL クエリ
`?tab=uptime&service=cert:boundarylabo.com` のように共有可能。

## 最小 env

```bash
# --- 認証基盤 ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=https://ops.boundarylabo.com
OWNER_EMAILS=runbirdgensou@gmail.com

# --- Supabase service_role（ops API / poller / receiver で必要）---
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# --- Health check polling ---
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/health|60

# --- TLS 証明書監視 ---
CERT_CHECK_TARGETS=boundarylabo.com,ops.boundarylabo.com,portal.boundarylabo.com
CERT_CHECK_INTERVAL_HOURS=24

# --- 外部ログ / OTel 受信 ---
PORTAL_LOG_INGEST_TOKEN=...
OTEL_INGEST_TOKEN=...

# --- アラート通知 ---
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

将来監視対象を増やす場合は `HEALTH_CHECK_TARGETS` に追記する。

```bash
HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/health|60;rezona|<rezona-url>|60
```

## boundarylabo.com 側のエンドポイント

| URL | 実装 | 用途 |
| --- | ---- | ---- |
| `https://boundarylabo.com/health` | `apps/server/src/routes/health.ts` | 軽量な外形監視 |
| `https://boundarylabo.com/health/deep` | 同上 | Supabase + LiveKit token sign の深いチェック |
| `https://ops.boundarylabo.com/api/healthz` | portal 自身 | portal が up しているか |

Caddy 設定は `boundary-metaverse/infra/Caddyfile` の `/health*` handle を参照。

## 外部 Health Check Polling

### アーキテクチャ

```text
instrumentation.ts
  ├ startHealthPoller()
  │   ├ setInterval で各 HEALTH_CHECK_TARGETS を fetch (5s timeout)
  │   ├ Supabase service_health_checks に INSERT (service_role)
  │   └ evaluateAndAlert()
  │         └ Discord Webhook (連続失敗/復旧時)
  └ startCertChecker()
      ├ CERT_CHECK_INTERVAL_HOURS 間隔で tls.connect
      ├ Supabase service_health_checks に INSERT (service=cert:<host>)
      └ maybeAlert()
            └ Discord Webhook (残 30d warn / 7d error / expired / connect err)
```

### フォーマット

- `HEALTH_CHECK_TARGETS=service|url|interval_seconds;...`
- `interval_seconds` 未指定は 60、30 未満は自動で 30 に丸め。
- 4 列目に env 名を指定すると Bearer token として送る。
- `CERT_CHECK_TARGETS=host1,host2`。port 指定したい場合は `host:port`。

### DB スキーマ適用

```bash
supabase db push
# または
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260424000001_service_health_checks.sql
```

テーブル `public.service_health_checks` が存在しているかで確認。RLS 有効・policy
なしなので service_role 以外からは全拒否。

cert 用のスキーマ変更は不要。既存テーブルを下記列割り当てで流用する。

| 列 | HTTP check | Cert check |
| --- | --- | --- |
| `service` | 任意 (例: `boundary`) | `cert:<host>` |
| `endpoint` | フル URL | `<host>:443` |
| `status_code` | HTTP status | `null` |
| `response_time_ms` | ミリ秒 | 残日数 |
| `ok` | `status < 400` | 残日数 >= 30 かつ未期限 |
| `error_message` | 4xx/5xx 原因 | `certificate already expired` 等 |

## Uptime タブ UI

- HTTP サービス: 稼働率 / 平均応答 / 最終成功 / 最終失敗 + バーチャート
- `cert:<host>`: 残り日数、最終チェック、状態、期間内チェック回数
- `今すぐ確認` ボタン: `POST /api/admin/ops/probe?service=...` を叩く。cert 系も対応。

## アラート

| 条件 | アラート | level |
| ---- | -------- | ----- |
| HTTP 直近 3 件が連続失敗 | `[service] DOWN` | error |
| HTTP 前回 DOWN から 10 分以内 | 抑制 | - |
| HTTP 直近 1 件が成功かつ前回 DOWN から 60 秒以上 | `[service] RECOVERED` | info |
| cert 残 30 日以下 | `[cert:<host>] 残り N 日` | warn |
| cert 残 7 日以下 | `[cert:<host>] 残り N 日` | error |
| cert 期限切れ | `[cert:<host>] 期限切れ` | error |
| cert チェック失敗 | `[cert:<host>] 証明書チェック失敗` | warn |

cert 通知は同一 host × 同一重大度につき 12 時間抑制。`DISCORD_WEBHOOK_URL`
未設定時は console log のみ。

## デプロイ手順（Droplet）

portal は Droplet `159.223.35.150` の docker compose `portal` サービスで稼働。
env は `/etc/boundary/.env` に追記して再起動する。

```bash
ssh root@159.223.35.150

cat >> /etc/boundary/.env <<'EOF'
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/health|60
CERT_CHECK_TARGETS=boundarylabo.com,ops.boundarylabo.com,portal.boundarylabo.com
CERT_CHECK_INTERVAL_HOURS=24
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PORTAL_LOG_INGEST_TOKEN=...
OTEL_INGEST_TOKEN=...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
EOF

cd /opt/boundary
docker compose pull portal
docker compose up -d portal --force-recreate
docker compose logs -f portal | grep -E '(health-poller|cert-checker|otel)'
```

## 動作確認チェックリスト

- [ ] `/etc/boundary/.env` に `HEALTH_CHECK_ENABLED=true` と `HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/health|60` を設定
- [ ] `SUPABASE_SERVICE_ROLE_KEY` が設定されている
- [ ] `OTEL_INGEST_TOKEN` が設定されている
- [ ] migration `20260424000001_service_health_checks.sql` が本番 Supabase に適用済み
- [ ] `npm run build` がエラーなく完了
- [ ] `npm run typecheck` がエラーなく完了
- [ ] `/admin/ops?tab=sync` で同期状況が表示される
- [ ] `/admin/ops?tab=logs-otel` で OTel logs が表示される
- [ ] `/admin/ops?tab=traces-otel` で OTel traces が表示される
- [ ] `/admin/ops?tab=uptime` で boundary が表示される
- [ ] 60 秒待って履歴テーブルに 1 行追加される
- [ ] 「今すぐ確認」ボタンで即時 1 行追加
- [ ] `/admin/ops?tab=uptime&service=cert:boundarylabo.com` で残り日数が表示される
- [ ] 「今すぐ確認」で cert チェックが走る
- [ ] `HEALTH_CHECK_TARGETS` を必ず失敗する URL に置換し、3 回連続失敗後に Discord に `[service] DOWN` が届く
- [ ] 復旧 URL に戻して、60 秒以上経過後に RECOVERED が届く

## curl 動作確認

```bash
curl -sS https://boundarylabo.com/health | jq
curl -sS https://ops.boundarylabo.com/api/healthz | jq

echo | openssl s_client -servername boundarylabo.com -connect boundarylabo.com:443 2>/dev/null \
  | openssl x509 -noout -dates
```

## 追加 API 一覧

| Method | Path | 説明 | RateLimit |
| ------ | ---- | ---- | --------- |
| GET | `/api/admin/ops/uptime?service=&hours=` | 履歴 + サマリ（cert:* も可） | 30 / 60s |
| POST | `/api/admin/ops/probe?service=` | 即時 probe 実行（cert:* も可） | 5 / 60s |
| GET | `/api/admin/activity` | Activity timeline | 15 / 60s |
| GET | `/api/admin/logs` | 受信ログ一覧 | 30 / 60s |
| GET | `/api/admin/otel/logs` | OTel logs | 30 / 60s |
| GET | `/api/admin/otel/traces` | OTel traces | 30 / 60s |
| GET | `/api/admin/otel/sync-checks` | OTel sync checks | 30 / 60s |

## 後日検討メモ

- boundary `/health/deep` のレスポンスを parse して component 別 uptime を可視化
- boundary `/health` に DB connection / memory 情報を追加してメトリクス化
- reticulum DB の phoenix_presence テーブルを読んで現在接続ユーザー数を表示
- DO Monitoring API から Droplet CPU/Memory を取得して portal に並べる
- Droplet 上で TLS 証明書残日数を shell で先に検出し、webhook で portal に通知する選択肢
