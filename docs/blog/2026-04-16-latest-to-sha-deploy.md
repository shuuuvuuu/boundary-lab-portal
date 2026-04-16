# `:latest` で始めて SHA タグに乗り換えた話

**2026-04-16 / 境界設計室 - Boundary LAB**

メタバース向けポータル（portal.boundarylabo.com）を DigitalOcean Kubernetes に載せた最初のフェーズで、Docker image のタグ付け戦略を `:latest` 固定にしていた。運用を始めて 1 日目に**「デプロイしたつもりで反映されない」**事故を経て、commit SHA ベースのデプロイに切り替えた。その判断過程を残しておく。

## 最初に `:latest` を選んだ理由

率直に言うと **ちゃんとした理由は無かった**。Next.js のチュートリアルやサンプルリポで頻繁に出てくるデフォルト構成だったから採用した、というだけだ。当時（Phase 2）の状況：

- ポータル 1 本だけを立ち上げたかった
- 初回の CI/CD を 1 日で組む必要があった
- 他のサービス（今日追加した hubs-entry-sidecar など）はまだ構想段階

「シンプルな方がいい」という素朴な判断で、CI の workflow テンプレートに入っていた `:latest` タグをそのまま採用した。K8s manifest 側も `image: ghcr.io/shuuuvuuu/boundary-lab-portal:latest` で固定した。

この時点で既に違和感はあった — **GitHub Actions の `docker/metadata-action` はデフォルトで `:latest` と `:短縮SHA` の両方を push してくれる**ので、`:latest` を参照する判断は偶然「もう 1 つの選択肢を使っていない」というだけの状態だった。だが、動いていたので気にしなかった。

## 事故：ワールドレジストリ機能を実装したのに反映されない

ポータルに「ディスカバー」（ワールドレジストリ）タブを追加する機能を実装、CI 通過、`git push`。GitHub Actions はビルドしてイメージも正常に GHCR に push。`gh run list` も `success`。しかし portal.boundarylabo.com にタブが現れない。

調査すると原因は明白だった：

```bash
$ kubectl -n hcce get pods -l app=portal
NAME                      READY   STATUS    RESTARTS   AGE
portal-84cdb79bd6-4fbw4   1/1     Running   0          14h
```

**14 時間前に起動した古い Pod がそのまま動いていた。**

Kubernetes の素直な動作として考えれば当然だ。`imagePullPolicy: Always` は**Pod が起動する時**に `latest` を取りに行く設定。manifest の `image:` 指定が変わっていない限り K8s は「Deployment は変わっていない」と判断し、Pod を再作成しない。新しい `:latest` がレジストリにあっても、Pod がいつ再起動するかは別の問題である。

対処は 1 行：

```bash
kubectl rollout restart deployment/portal
```

これで Pod が順次作り直され、新 Pod が起動時に最新の `:latest` を pull してくれる。即座に反映された。

## `:latest` 固定運用の構造的な問題

事故を乗り越えたあとで、冷静に `:latest` 固定のデメリットを棚卸しした：

| 問題 | 詳細 |
| --- | --- |
| **「何が本番に載っているか」が不明** | `kubectl get deploy` は `:latest` としか答えない。git commit と 1:1 対応しない |
| **ロールバックが面倒** | 前の `:latest` は上書き済みで消えている。戻すには CI を巻き戻して再 push が必要 |
| **イメージ更新に明示的な restart が必要** | CI にその一手間が必要、または運用者が覚えていないと忘れる |
| **キャッシュの穴** | 別ノードに scale out した時、どのノードの `:latest` を信用していいか揺れる |

一方、メリットとして想定していたのは「シンプル」だけだった。しかし CI/CD を育てていく過程で、そのシンプルさは幻だった — 「反映されない事故」の認知コスト、復旧の手作業、運用記憶の負担、いずれも `:latest` タグの一見のシンプルさで帳消しになっていない。

## SHA タグに乗り換える

迷いは無かった。切り替えは小さく済む：

1. **イメージ側**: 変更不要。CI はすでに `:短縮SHA` タグを自動で push している
2. **K8s manifest 側**: `image: ghcr.io/.../portal:latest` をテンプレート的な placeholder にしておき、CI の deploy ステップで `kubectl set image deployment/portal portal=ghcr.io/.../portal:<SHA>` を叩いて具体化
3. **GitHub Secret**: DigitalOcean の Access Token を追加、`doctl kubernetes cluster kubeconfig save` で kubeconfig を取得

実装後のフローは以下のように変わる：

```
git push
  ↓
GitHub Actions
  ├─ Docker build & push (:latest と :<SHA> の両方)
  └─ K8s deploy: kubectl set image ... portal=...:<SHA>
        ↓
Kubernetes
  「image タグが変わった = 新バージョン」と自覚
        ↓
自動で Rolling Update、新 Pod が起動
```

このフローだと：

- **「今本番に載っているのはどの commit か」が `kubectl get deploy` で即確認可能**（image タグに SHA が書いてある）
- **ロールバックが `kubectl set image ...:<古いSHA>` の 1 コマンド**
- **CI から明示的な restart が不要**（image が変われば K8s が勝手に動く）
- 運用の記憶に頼らなくていい

## 振り返って

Phase 2 の `:latest` 固定は、その時点では妥当だった — 「ポータルを 1 本立ち上げる」という目標に対して最短だったから。しかし、**シンプルさを優先した設計は、運用を始めた瞬間に複雑さに転化する**ことが多い。今回の事故はその典型だった。

デプロイ戦略の選択は、技術的な好みの問題ではなく「運用中にどんな事故が起き得るか」で決まる。`:latest` と `:<SHA>` の違いは、

- 事故を起こしてから気づく（実運用で学ぶ）
- 最初から SHA 派にする（経験者が予防する）

どちらでも最終的には同じ結論にたどり着くはずだ。今回は前者のパターンを経験できた。

もし「Next.js アプリを K8s に載せる最初のチュートリアル」を書くなら、**最初から SHA タグでデプロイする方法を書く**べきだろう。`:latest` のシンプルさは、入門時にこそ避けた方がいい罠だと思う。

---

### 技術メモ

- `docker/metadata-action@v5` はデフォルトで `type=sha` を含む複数タグを同時に push 可能
- `digitalocean/action-doctl@v2` で `doctl kubernetes cluster kubeconfig save` を CI で実行
- `kubectl set image` は manifest を直接触らずに image タグだけを差し替える便利コマンド
- ロールバックは `kubectl rollout undo deployment/portal` でも可（直前の revision に戻す）

### 参考
- Kubernetes Deployment rolling update 動作: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- GitHub Actions metadata-action: https://github.com/docker/metadata-action
