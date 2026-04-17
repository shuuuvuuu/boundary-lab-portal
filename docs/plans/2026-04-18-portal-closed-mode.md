# Portal Closed Mode

- `PORTAL_CLOSED="true"` の間、Enterprise (`plan_tier='enterprise'`) 以外は `/coming-soon` に集約する。
- `/login`、`/auth/**`、`/api/healthz` はクローズ中も通す。
- `/api/public/**` はクローズ中に `503` を返し、公開 LP 用データを止める。
- 通常公開へ戻すときは `PORTAL_CLOSED="false"` に変更する。
- 反映手順:
- `kubectl patch secret portal-env -n hcce --type merge -p '{"stringData":{"PORTAL_CLOSED":"false"}}'`
- `kubectl rollout restart deployment/boundary-lab-portal -n hcce`
- 再度クローズするときは `PORTAL_CLOSED="true"` に戻して同じく rollout restart。
