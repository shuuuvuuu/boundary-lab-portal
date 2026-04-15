# Phase 3a: Hubs アカウント連携（Reticulum DB email lookup）

- **日付**: 2026-04-15
- **対象**: `src/lib/hubs/db.ts` / `src/app/api/hubs/me/route.ts` / `PersonalTab.tsx`
- **位置づけ**: ポータル Phase 2-3 の橋渡し。Hubs 情報の「参照」のみ実装
- **関連**: E-1 Reticulum Presence 調査結果 / モニタリングロードマップ

## 採用方針

| 決定項目 | 選択 |
|---|---|
| 認証方式 | **admin token / DB 直読み** (rezona 参考、B2B 向けに最短) |
| 紐付け方式 | **Supabase email = Hubs `logins.identifier` による自動 lookup** |
| 入室履歴 | **スコープ外**（Reticulum は永続化しないため。WS サイドカー方式で別タスク化） |
| DB 接続 | `RETICULUM_DB_URL` 読み取り専用ロール前提、`pg.Pool` を globalThis 固定 |

## Reticulum スキーマ前提

```
accounts(account_id, state, inserted_at, updated_at)
logins(account_id, identifier)  -- identifier は email (login 用)
identities(account_id, name)    -- 任意の表示名
```

スキーマに差異がある場合は `src/lib/hubs/db.ts` の `LOOKUP_BY_EMAIL_SQL` のみ変更。

## 再同期（reconcile）方針

`profiles.hubs_account_id` は**初回のみ書き込み**（`.is("hubs_account_id", null)` ガード）。

### 想定される非同期ケース

| ケース | 対応方針 |
|---|---|
| Hubs 側で同 email の account を削除 → 再作成 | `profiles.hubs_account_id` は古い ID のまま。検知したら admin が Supabase 側で `hubs_account_id = NULL` にして次回アクセス時に再 lookup |
| Supabase 側 email 変更 | Supabase Auth で email 変更イベントをフックし `hubs_account_id = NULL` へリセットする処理を Phase 3b で追加検討 |
| Hubs 側 email 変更 | 代表に通知 → Supabase 側を合わせる運用（件数少のため手動で十分） |

自動 reconcile ジョブは**Stage 2（有償顧客導入後）に検討**。Stage 1 は手動で問題ない規模。

## 受入基準

- `npm run build` 全緑（tsc + lint + Next 型検証）
- `RETICULUM_DB_URL` 未設定時: `configured:false` を返し UI に「未接続」と表示
- 設定済・email 一致あり: Account ID / Identity / 登録日 を表示、`profiles.hubs_account_id` が初回のみ更新される
- 設定済・email 一致なし: UI に「未登録」メッセージ
- DB 接続失敗 / timeout / スキーマ差異: 502 を返し Discord に kind + code を送信（email など PII は送らない）

## やらないこと（Phase 3b 以降）

- 入室履歴の収集（WS サイドカー）
- Hubs OAuth 連携
- `hubs_account_id` 自動 reconcile ジョブ
- アバター URL 取得（標準 Reticulum には avatar を account に紐付ける公開カラムが無いため別途調査）
