# Boundary LAB Portal

境界設計室 / Boundary LAB の自社ポータル Web サービス (Feat-015)。

## 概要

- 個人用タブ: Hubs アカウント情報・入室履歴・個人カレンダー
- 運営用タブ: Feat-014 運用ダッシュボード (最上位プラン限定)

## 技術スタック

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase (Auth / Postgres / RLS)
- 既存 DO K8s に同居デプロイ予定 (Phase 2)

## ローカル起動

```bash
npm install
cp .env.example .env.local
# .env.local に Supabase プロジェクトのキーを投入
npm run dev
```

`http://localhost:3000` を開く。

## Supabase セットアップ

`supabase/migrations/` 配下の SQL を Supabase ダッシュボードの SQL Editor または CLI で実行する。

## Hubs 入退室履歴サイドカー

Feat-015 Phase 3b の Reticulum Presence 収集サイドカーは `services/hubs-entry-sidecar/` に独立 package として配置している。

```bash
cd services/hubs-entry-sidecar
npm install
cp .env.example .env
npm run build
npm start
```

本番は `supabase/migrations/20260416000002_room_entry_events.sql` を適用後、`hubs-entry-sidecar-env` Secret を作成し、`k8s/hubs-entry-sidecar.yaml` を `hcce` namespace に適用する。

## Phase

- **Phase 1 (本コミット)**: 骨組み・認証・タブ・個人カレンダー CRUD・運営タブ placeholder
- Phase 2: Hubs / Reticulum 連携、Dockerfile、K8s デプロイ
- Phase 3: Feat-014 7 列ダッシュボード実装
