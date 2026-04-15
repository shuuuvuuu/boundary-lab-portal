# Phase 2 デプロイ + portal.boundarylabo.com サブドメイン整備

- **日付**: 2026-04-15
- **対象**: Docker 化 / K8s 上へのデプロイ / `portal.boundarylabo.com` の TLS 化
- **前提**: A-1 cowork/showroom 計画書の手順と同じ DO SGP1 クラスタ (`boundarylabo-k8s`) / LB IP `139.59.222.218` / `certbotbot` フロー

## 成果物（リポジトリ側）

- `Dockerfile` — Next.js 15 standalone 出力を Alpine 22 上で実行（非 root / 3000 番公開）
- `.dockerignore`
- `next.config.mjs` に `output: "standalone"` 追記
- `k8s/namespace.yaml` — 新規 namespace `portal`
- `k8s/deployment.yaml` — Deployment + Service（`ghcr.io/shuuuvuuu/boundary-lab-portal:latest` を pull）
- `k8s/ingress.yaml` — `portal.boundarylabo.com` を ingress-nginx で TLS 終端
- `k8s/secret.example.yaml` — 環境変数スキーマ参照用（実値は入れない）
- `k8s/kustomization.yaml` — `kubectl apply -k k8s/` で一括適用
- `.github/workflows/docker.yml` — master push で GHCR に build & push

## 代表アクションが必要な項目

### 0. ingress-nginx の存在確認（最優先・必ず最初に）

A-1 は haproxy 経路だが、本計画は `ingress-nginx` 直結を前提とする。クラスタに controller が入っていない場合 Ingress を apply しても結線されない。

```bash
kubectl get pods -A | grep ingress-nginx
kubectl get ingressclass
```

- **両方がヒットする**: そのまま次ステップへ
- **未導入**: 以下のどちらかを選択
  - (a) `helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace --set controller.service.loadBalancerIP=139.59.222.218` ※LB を新規取得する設計変更が絡む点に注意
  - (b) A-1 と同じ haproxy overlay に portal 用 frontend を追加する方針に切替（Ingress/kustomization を書き直し）

判断が付かない場合はここで一度停止して相談。

### 1. DNS（Porkbun）

| Type | Host | Answer | TTL |
|---|---|---|---|
| A | `portal` | `139.59.222.218` | 600 |

追加後 `dig portal.boundarylabo.com` で LB IP が返ることを確認（5〜30 分）。

### 2. TLS 証明書発行（certbotbot）

A-1 計画書 §4 と同じ手順。ssl_script/cbb.yaml テンプレを

```
DOMAIN=portal.boundarylabo.com
CERT_NAME=cert-portal.boundarylabo.com
```

で差し替え、`/tmp/cbb-portal.yaml` として保存し次を実行：

```bash
kubectl config current-context  # do-sgp1-boundarylabo-k8s であること
kubectl delete pod certbotbot-http -n hcce --ignore-not-found
kubectl apply -f /tmp/cbb-portal.yaml
kubectl get pod certbotbot-http -n hcce -w
kubectl get secret cert-portal.boundarylabo.com -n hcce
```

### 3. 証明書 Secret を portal namespace へコピー

Ingress は `portal` namespace 内の Secret を参照するため、`hcce` で発行した証明書を `portal` namespace へコピー：

```bash
kubectl get secret cert-portal.boundarylabo.com -n hcce -o yaml \
  | sed 's/namespace: hcce/namespace: portal/' \
  | kubectl apply -f -
```

### 4. GHCR パッケージの公開設定

初回 push 後に GitHub の Packages ページで `boundary-lab-portal` を public にするか、private のまま K8s に pull シークレット（`ghcr-auth`）を追加する。

**Public にする場合**（推奨・最短）:
- GitHub → Packages → boundary-lab-portal → Package settings → Change visibility → Public

**Private のままにする場合**:
```bash
kubectl create secret docker-registry ghcr-auth -n portal \
  --docker-server=ghcr.io \
  --docker-username=shuuuvuuu \
  --docker-password='<personal access token with read:packages>' \
  --docker-email=runbirdgensou@gmail.com
```
その後 `k8s/deployment.yaml` の `spec.template.spec` に以下を追記（本リポジトリでは未設定）:
```yaml
imagePullSecrets:
  - name: ghcr-auth
```

### 5. 環境変数 Secret 作成

```bash
kubectl create secret generic portal-env -n portal \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL='https://<project>.supabase.co' \
  --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY='<anon-key>' \
  --from-literal=NEXT_PUBLIC_SITE_URL='https://portal.boundarylabo.com' \
  --from-literal=DISCORD_WEBHOOK_URL='<discord-webhook>' \
  --from-literal=RETICULUM_DB_URL='' \
  --from-literal=TRUSTED_PROXY_HOPS='1'
```

### 6. K8s 反映

```bash
kubectl apply -k k8s/
kubectl rollout status deploy/portal -n portal
kubectl get pod -n portal
```

### 7. 動作確認

```bash
curl -I https://portal.boundarylabo.com/login   # 200 想定
curl -I https://portal.boundarylabo.com/         # 307 -> /login 想定
```

## Supabase 側設定（忘れがち）

Magic Link のリダイレクト許可 URL に以下を追加（Supabase ダッシュボードの Auth → URL Configuration）:

- Site URL: `https://portal.boundarylabo.com`
- Redirect URLs: `https://portal.boundarylabo.com/auth/callback`

## ロールバック

- Deployment 単体: `kubectl rollout undo deploy/portal -n portal`
- Ingress 停止: `kubectl delete ingress portal-tls -n portal`
- 名前空間丸ごと: `kubectl delete ns portal`（Secret も一緒に消える点に注意）

## 次の候補

- Supabase Magic Link の Rate Limit 設定確認（ハードニング Phase B-2 の布石）
- 観測: portal pod のログを既存 Grafana に流し込み（モニタリングロードマップと統合）
- WS サイドカー（Phase 3b 入室履歴収集）を別 Deployment として追加
