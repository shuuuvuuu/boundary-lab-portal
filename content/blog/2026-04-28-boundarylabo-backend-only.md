---
title: 自営メタバースを撤去してバックエンド業務基盤に転用した話
slug: 2026-04-28-boundarylabo-backend-only
date: 2026-04-28
description: 境界 LAB が運用していた自営メタバース基盤 (Hubs CE → rezona 型) を完全撤去し、Droplet をバックエンド業務専用基盤に作り変えた経緯と構成
tags: boundary-lab,infra,droplet,operations
---

## なぜ撤去したか

境界 LAB はメタバース体験設計の事業ですが、自社で**自営メタバースサーバー**まで持つ構成は、運用負荷の割にメリットが少なくなっていました。

- 並行で進めていた rezona (GIFTERRA Metaverse Platform) が本番化
- 自分用空間は rezona 内のワールドで代替可能 (オーナー権限取得済)
- メタバース基盤と業務監視基盤が同居していたため変更影響が大きい

そこで 2026-04-27 に「自営メタバースを完全撤去し、Droplet をバックエンド業務専用基盤として残す」判断をしました。

## 撤去前の構成 (legacy/boundary-standalone)

DigitalOcean Droplet `s-2vcpu-4gb` 1 台に Caddy + 4 サービスを compose で同居させていた構成。

- `caddy`: 80/443 終端
- `app`: Vite + R3F + VRM フロント
- `server`: Express + Socket.io + LiveKit Token + R2 presign
- `portal`: Next.js 15 standalone (boundary-lab-portal)

これに LiveKit Cloud + Supabase + Cloudflare R2 + Sentry + Scaleway TEM が SaaS で並列していました。

## 撤去後 (Phase A1〜A3 完了)

Droplet 上に残るのは 3 サービスだけ。

- `caddy`: 80/443 終端 (apex は 302 で `ops.boundarylabo.com` へ redirect)
- `server`: `/health` と `/api/admin/metrics` のみの最小構成
- `portal`: Next.js 15 (`ops.boundarylabo.com`)

LiveKit Cloud は解約、Supabase の `world` schema は DROP、R2 の `boundary-assets` は削除。代わりに portal に以下を追加しました。

- **cron / scheduled job ランナー**: 毎日 / 毎週のスケジュール実行
- **アラート**: Discord Webhook + Email (Scaleway TEM SMTP)
- **ログ集約**: 外部サービス (rezona など) からの pino ログを `/api/logs/ingest` で受信
- **バックアップ orchestration**: Supabase 主要テーブル + Sentry issue サマリを R2 に snapshot
- **TODO 管理**: 期限通知付き
- **ブログホスティング**: 今あなたが見ているこのブログ

## 設計上の判断

「Droplet 側で `cron.d` を増やすか、portal の Next.js プロセスに乗せるか」で迷いましたが、**既に health-poller / cert-checker が portal の `instrumentation.ts` から起動している**ので、scheduler も同じ仕組みに乗せました。`JOB_RUNNER_ENABLED=true` の env でまとめてオン/オフでき、将来 horizontal scale したくなったら別プロセスへ移すのも難しくない構成です。

## これからやること (B3 / A4 以降)

- rezona 側 Track B3 着手 (api / socket.io / DDL ロギング)
- 境界 LAB の販売パッケージ向けドキュメント化
- ブログ連載 Phase 0〜8 の本格執筆

このブログは「**運営記録 = 営業資料**」という方針で書いていく予定です。
