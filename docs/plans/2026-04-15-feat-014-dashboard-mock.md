# Feat-014 運営ダッシュボード モック拡充計画

- **日付**: 2026-04-15
- **対象**: `src/components/AdminTab.tsx`
- **位置づけ**: Phase 1.5（Phase 1 骨組みと Phase 3 本実装の間）
- **目的**: Reticulum/mediasoup 実データ連携（Phase 3）を待たず、運営タブを「アクセスでき、内容も営業資料として見せられる」状態にする

## 背景

Phase 1 時点で `AdminTab.tsx` に 7 列テーブル placeholder + ダミー 1 行が存在。実データ連携（Phase 3）の前提となる mediasoup-exporter / reticulum DB 直読みはまだ未着手。営業・社内確認のため、先にモックで UI 完成度を上げておく。

## スコープ

### やること
1. **ダミーデータを 4〜5 ルーム分に拡充**
   - ルーム例: Cowork Hub / Event Hall / Meeting Room A / Gallery / Showcase Room
   - 数値は `boundary-lab/output/infra/A-2_contract_review.md`（DO egress/ノード費按分試算）と `project_boundary_monitoring_roadmap.md` の 7 列定義を参考にした妥当な桁感
2. **集計行（合計 / 平均）を追加**
   - 合計: 月間利用日数・延べ人時・UU・推定通信量・推定按分コスト
   - 平均: 同時接続ピーク
3. **月次切替 UI（モック）**
   - `<select>` で直近 3 ヶ月を選択可（データは全月同じダミーで OK）
   - 状態は `useState` のみ、API 連携なし
4. **「モック表示中」バナー**
   - 表の上に注記（実データではない旨）を明示
5. **空状態（ルーム 0 件）の表示は不要**（Phase 3 で対応）

### やらないこと
- Reticulum DB / mediasoup-exporter との接続
- グラフ描画ライブラリ導入
- CSV ダウンロード
- 認可ロジック変更（既存 `plan_tier === "enterprise"` 判定のまま）

## 受入基準

- `npm run dev` で起動し、enterprise ロールで `/` にアクセス → 運営タブ表示 → 4〜5 行 + 合計行が表示される
- 月次セレクタを切り替えても画面が壊れない
- `npm run lint` / `npx tsc --noEmit` がエラーなし
- モバイル幅（375px）で横スクロール可能

## 実装ステップ

1. `AdminTab.tsx` の `dummyRows` をルーム別 4〜5 件に拡張
2. 集計関数（合計 / 平均）を同ファイル内に追加
3. 月次セレクタ `<select>` を表の上に配置
4. 「モック表示中」バナーを `<p>` で追加
5. tfoot に集計行を追加
6. 型チェック・lint 実行

## 委譲

- **実装**: codex:rescue（メモリ `feedback_codex_for_code.md` の方針）
- **レビュー**: QA エージェント（spec 準拠・型・lint）
