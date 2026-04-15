# Phase 2 デプロイ + portal.boundarylabo.com サブドメイン整備

- **日付**: 2026-04-15（haproxy-ingress 方式に改訂）
- **対象**: Docker 化 / K8s 上へのデプロイ / `portal.boundarylabo.com` の TLS 化
- **前提**: A-1 cowork/showroom 計画書と同じ haproxy-ingress + certbotbot フロー
- **インフラ実査結果**: クラスタに ingress-nginx は未導入 / HAProxy Ingress Controller (`mozillareality/haproxy:stable-latest`) が `--ingress.class=haproxy` で稼働 / LB IP `139.59.222.218` / ポータルも `hcce` namespace に同居（cert コピー不要化のため）

## 成果物（リポジトリ側）

- `Dockerfile` / `.dockerignore` / `next.config.mjs` (`output: "standalone"`)
- `k8s/deployment.yaml` — Deployment + Service (namespace: hcce)
- `k8s/ingress.yaml` — `kubernetes.io/ingress.class: haproxy` annotation 方式、既存 `subdomain-tls` と揃えた
- `k8s/secret.example.yaml` — スキーマ参照用（実値投入は kubectl コマンドで）
- `k8s/kustomization.yaml` — `kubectl apply -k k8s/` で一括適用
- `.github/workflows/docker.yml` — master push で GHCR に build & push
- `src/app/api/healthz/route.ts` — 外部依存ゼロの probe 用

## 代表アクションが必要な項目

### 1. DNS（Porkbun）

| Type | Host | Answer | TTL |
|---|---|---|---|
| A | `portal` | `139.59.222.218` | 600 |

```powershell
dig portal.boundarylabo.com +short
# 139.59.222.218 が返ればOK（5〜30 分）
```

### 2. TLS 証明書発行（certbotbot / hcce namespace）

A-1 と同じ手順。既存 `ssl_script/cbb.yaml` を

```
DOMAIN=portal.boundarylabo.com
CERT_NAME=cert-portal.boundarylabo.com
```

に差し替えて `/tmp/cbb-portal.yaml` に保存し実行:

```powershell
kubectl delete pod certbotbot-http -n hcce --ignore-not-found
kubectl apply -f /tmp/cbb-portal.yaml
kubectl get pod certbotbot-http -n hcce -w
kubectl get secret cert-portal.boundarylabo.com -n hcce
```

※ 今回は portal も `hcce` 名前空間に同居するため **証明書の namespace コピー作業は不要**。

### 3. GHCR パッケージ可視性

`boundary-lab-portal` パッケージを **Public 化** 推奨:
GitHub → Packages → boundary-lab-portal → Package settings → Change visibility → Public

Private のまま運用する場合は `hcce` namespace に `ghcr-auth` Secret を作り、`k8s/deployment.yaml` の `spec.template.spec` に `imagePullSecrets: [{ name: ghcr-auth }]` を追記:

```powershell
kubectl create secret docker-registry ghcr-auth -n hcce `
  --docker-server=ghcr.io `
  --docker-username=shuuuvuuu `
  --docker-password='<PAT read:packages>' `
  --docker-email=runbirdgensou@gmail.com
```

### 4. 環境変数 Secret 作成（hcce namespace）

```powershell
kubectl create secret generic portal-env -n hcce `
  --from-literal=NEXT_PUBLIC_SUPABASE_URL='https://<project>.supabase.co' `
  --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY='<anon-key>' `
  --from-literal=NEXT_PUBLIC_SITE_URL='https://portal.boundarylabo.com' `
  --from-literal=DISCORD_WEBHOOK_URL='<discord-webhook>' `
  --from-literal=RETICULUM_DB_URL='' `
  --from-literal=TRUSTED_PROXY_HOPS='1'
```

### 5. Supabase 設定

ダッシュボード → Authentication → URL Configuration:
- **Site URL**: `https://portal.boundarylabo.com`
- **Redirect URLs** に追加（既存削除せず）: `https://portal.boundarylabo.com/auth/callback`

### 6. K8s 反映

```powershell
cd C:\Users\runbi\projects\boundary-lab-portal
kubectl apply -k k8s/
kubectl rollout status deploy/portal -n hcce
kubectl get pod -n hcce -l app=portal
```

### 7. 動作確認

```powershell
curl.exe -I https://portal.boundarylabo.com/api/healthz   # 200 想定
curl.exe -I https://portal.boundarylabo.com/               # 307 -> /login 想定
```

ブラウザで `https://portal.boundarylabo.com/login` を開き Magic Link を送信 → メールから認証 → 個人タブ表示まで確認。

## ロールバック

```powershell
kubectl delete -k k8s/                                  # portal deploy + ingress + svc 除去
kubectl delete secret portal-env -n hcce                # env もクリア
kubectl delete secret cert-portal.boundarylabo.com -n hcce  # 証明書ごと消したい時
```

DNS は Porkbun 側でレコード削除（TTL 600 で約 10 分）。既存 Hubs への影響はゼロ（Ingress/Service/Secret 名が分離されているため）。

## 次の候補

- Supabase Magic Link の Rate Limit 設定確認
- portal pod ログを既存 Grafana に流し込み
- Phase 3b WS サイドカー（入室履歴収集）を別 Deployment として追加
