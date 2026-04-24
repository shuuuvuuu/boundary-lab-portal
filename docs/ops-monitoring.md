# /admin/ops 運用監視（Phase D-1 / boundary 自己監視）

Boundary LAB Portal の `/admin/ops` 配下の運用監視機能リファレンス。

**方針転換 (2026-04-24)**: rezona 向け実装ではなく `https://boundarylabo.com/` の自己監視に振り切る。rezona 関連コードは env gate で無効化した状態で温存してあるため、将来復活させたい時は env を足すだけで復帰可能。

## 概要

| タブ | データソース | 目的 |
| ---- | ------------ | ---- |
| 未解決 Issues | Sentry Issues API | 未解決 error / warn issue の一覧と詳細 |
| Logs | Sentry Events API | pino → Sentry の timeline (warn/error) |
| Uptime | Supabase `service_health_checks` | HTTP health check + TLS 証明書残日数 |

いずれも owner email (`OWNER_EMAILS`) のみアクセス可。UI は URL クエリ `?tab=uptime&service=cert:boundarylabo.com` で共有可能。

## 最小 env（boundary 単体監視）

```bash
# --- 認証基盤 ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=https://portal.boundarylabo.com
OWNER_EMAILS=runbirdgensou@gmail.com

# --- Supabase service_role（health poller / ops API で必要）---
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# --- Sentry (boundary のみ)---
SENTRY_AUTH_TOKEN=sntryu_xxxxx        # Personal Token (sntrys_ は不可)
SENTRY_ORG=shuu-dw
SENTRY_SERVER_PROJECT=boundary-metaverse-server
SENTRY_WEB_PROJECT=boundary-metaverse-web

# --- Health check polling ---
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/health|60

# --- TLS 証明書監視 ---
CERT_CHECK_TARGETS=boundarylabo.com,portal.boundarylabo.com
CERT_CHECK_INTERVAL_HOURS=24

# --- アラート通知 ---
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

rezona を監視対象に戻したくなったら:
```bash
HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/health|60;rezona|<rezona-url>|60
SENTRY_REZONA_PROJECTS=rezona-server,rezona-web
# SENTRY_REZONA_AUTH_TOKEN / SENTRY_REZONA_ORG は共通で足りれば省略可
```

`SENTRY_REZONA_PROJECTS` が設定されている場合のみ、OpsTabs 右上に `Sentry Service: boundary | rezona` セレクタが表示される。未設定時はセレクタ自体を隠して boundary 単一運用。

## boundarylabo.com 側のエンドポイント

| URL | 実装 | 用途 |
| --- | ---- | ---- |
| `https://boundarylabo.com/health` | `apps/server/src/routes/health.ts` | 軽量（外部依存なし、200 即返し）|
| `https://boundarylabo.com/health/deep` | 同上 | Supabase + LiveKit token sign の深いチェック |
| `https://portal.boundarylabo.com/api/healthz` | portal 自身 | portal が up しているか |

Caddy 設定は `boundary-metaverse/infra/Caddyfile` の `/health*` handle を参照。

## Phase D-1a: Sentry サービスタブ

- `SENTRY_AUTH_TOKEN` は sntryu_ プレフィクスの Personal Token 必須（Organization Token `sntrys_` は Issue API を叩けない）。
- rezona セレクタは `SENTRY_REZONA_PROJECTS` が空なら **UI 非表示**（boundary 単一）。
- URL クエリに `?service=rezona` が付いていても、env 未設定時は boundary に丸める。

## Phase D-1b: 外部 Health Check Polling

### アーキテクチャ

```
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

- `HEALTH_CHECK_TARGETS=service|url|interval_seconds;…`
  - `interval_seconds` 未指定は 60、30 未満は自動で 30 に丸め。
- `CERT_CHECK_TARGETS=host1,host2` （カンマ区切り、host のみ。port 指定したい場合 `host:port`）

### DB スキーマ適用

```bash
# Supabase Dashboard → SQL Editor から実行するか、CLI で
supabase db push
# あるいは psql で
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260424000001_service_health_checks.sql
```

テーブル `public.service_health_checks` が存在しているかで確認。RLS 有効・policy なしなので service_role 以外からは全拒否。

cert 用のスキーマ変更は不要。既存テーブルを下記列割り当てで流用:

| 列 | HTTP check | Cert check |
| --- | --- | --- |
| `service` | 任意 (例: `boundary`) | `cert:<host>` |
| `endpoint` | フル URL | `<host>:443` |
| `status_code` | HTTP status | `null` |
| `response_time_ms` | ミリ秒 | **残日数** |
| `ok` | `status < 400` | 残日数 ≥ 30 かつ未期限 |
| `error_message` | 4xx/5xx 原因 | "certificate already expired" 等 |

### Uptime タブ UI

- **HTTP サービス**: 稼働率 / 平均応答 / 最終成功 / 最終失敗 + バーチャート
- **cert:<host>**: 残り日数を大きく表示（30d 以下 amber, 7d 以下 red）+ 最終チェック / 状態 / 期間内チェック回数
- `今すぐ確認` ボタン: `POST /api/admin/ops/probe?service=...` を叩く。cert 系も対応（rate limit 5req/60s）。

## Phase D-1c: Discord アラート

| 条件 | アラート | level |
| ---- | -------- | ----- |
| HTTP 直近 3 件が連続失敗 | `[service] DOWN` | error |
| HTTP 前回 DOWN から 10 分以内 | （抑制） | — |
| HTTP 直近 1 件が成功かつ前回 DOWN から 60 秒以上 | `[service] RECOVERED` | info |
| cert 残 30 日以下 | `[cert:<host>] 残り N 日 — 更新検討推奨` | warn |
| cert 残 7 日以下 | `[cert:<host>] 残り N 日 — 7 日以内に期限切れ` | error |
| cert 期限切れ | `[cert:<host>] 期限切れ — 即座に証明書を更新` | error |
| cert チェック失敗 (tls error, timeout) | `[cert:<host>] 証明書チェック失敗` | warn |

cert 通知は同一 host × 同一重大度につき 12 時間抑制。`DISCORD_WEBHOOK_URL` 未設定時は `[discord-alert disabled]` console log のみ。

alert の state は process メモリに保持されるため、Portal 再起動直後は再度 DOWN / warn を送る可能性がある。

## デプロイ手順（Droplet）

portal は Droplet `159.223.35.150` の docker compose `portal` サービスで稼働（`boundary-metaverse/infra/docker-compose.yml`）。env は `/etc/boundary/.env` に追記して再起動する。

```bash
# 1. Droplet に SSH
ssh root@159.223.35.150

# 2. /etc/boundary/.env に以下を追記
#    （既存値は保持、新規のみ追記）
cat >> /etc/boundary/.env <<'EOF'
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/health|60
CERT_CHECK_TARGETS=boundarylabo.com,portal.boundarylabo.com
CERT_CHECK_INTERVAL_HOURS=24
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SENTRY_AUTH_TOKEN=sntryu_...
SENTRY_ORG=shuu-dw
SENTRY_SERVER_PROJECT=boundary-metaverse-server
SENTRY_WEB_PROJECT=boundary-metaverse-web
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
EOF

# 3. Supabase migration を適用（初回のみ）
#    Supabase Dashboard → SQL Editor で supabase/migrations/20260424000001_service_health_checks.sql を実行

# 4. Docker image を最新にして portal サービスだけ再作成
cd /opt/boundary
docker compose pull portal
docker compose up -d portal --force-recreate

# 5. ログで poller 起動を確認
docker compose logs -f portal | grep -E '(health-poller|cert-checker)'
# => [health-poller] starting with 1 target(s): boundary(https://boundarylabo.com/health, 60s)
# => [cert-checker] starting with 2 host(s), interval 24h: boundarylabo.com, portal.boundarylabo.com
```

## 動作確認チェックリスト

- [ ] `/etc/boundary/.env` に `HEALTH_CHECK_ENABLED=true` と `HEALTH_CHECK_TARGETS=boundary|https://boundarylabo.com/health|60` を設定
- [ ] `SUPABASE_SERVICE_ROLE_KEY` が設定されている
- [ ] migration `20260424000001_service_health_checks.sql` が本番 Supabase に適用済み
- [ ] `npm run build` がエラーなく完了
- [ ] `npm run typecheck` がエラーなく完了
- [ ] `/admin/ops?tab=uptime` で boundary が表示される
- [ ] 60 秒待って履歴テーブルに 1 行追加される
- [ ] 「今すぐ確認」ボタンで即時 1 行追加
- [ ] `/admin/ops?tab=uptime&service=cert:boundarylabo.com` で残り日数が表示される
- [ ] 「今すぐ確認」で cert チェックが走る
- [ ] `HEALTH_CHECK_TARGETS` を `http://localhost:9/bad` のような必ず失敗する URL に置換し、3 回連続失敗後に Discord に `[service] DOWN` が届く
- [ ] 復旧 URL に戻して、60 秒以上経過後に RECOVERED が届く
- [ ] Sentry Service セレクタが **表示されない**（rezona env 未設定時）

### curl 動作確認

```bash
# boundary health チェック（portal 経由ではなく直接確認）
curl -sS https://boundarylabo.com/health | jq
# => { "status": "ok", "ts": "...", "version": "..." }

# portal 自身の healthz
curl -sS https://portal.boundarylabo.com/api/healthz | jq
# => { "ok": true, "ts": ... }

# cert 残日数を手動で確認（openssl 直叩き）
echo | openssl s_client -servername boundarylabo.com -connect boundarylabo.com:443 2>/dev/null \
  | openssl x509 -noout -dates
# => notBefore=... notAfter=...
```

## 追加 API 一覧

| Method | Path | 説明 | RateLimit |
| ------ | ---- | ---- | --------- |
| GET | `/api/admin/ops/uptime?service=&hours=` | 履歴 + サマリ（cert:* も可） | 30 / 60s |
| POST | `/api/admin/ops/probe?service=` | 即時 probe 実行（cert:* も可） | 5 / 60s |
| GET | `/api/admin/sentry/issues?service=` | Issue 一覧 | 10 / 60s |
| GET | `/api/admin/sentry/issues/[id]?service=` | Issue 詳細 | 20 / 60s |
| GET | `/api/admin/sentry/events?service=&level=` | Log events | 10 / 60s |

## 後日検討メモ（Phase D-2 以降）

- boundary `/health/deep` のレスポンス `{ checks: { supabase, livekit } }` を parse して component 別 uptime を可視化
- boundary `/health` に `{ db: { connections: N }, memory: {...} }` を追加してメトリクス化
- reticulum DB の phoenix_presence テーブルを読んで現在接続ユーザー数を表示
- DO Monitoring API から Droplet CPU/Memory を取得して portal に並べる
- Droplet 上で TLS 証明書残日数を shell で先に検出し（`certbot renew --dry-run`）webhook で portal に通知する選択肢
