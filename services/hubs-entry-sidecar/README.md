# Hubs Entry Sidecar

Reticulum の Phoenix Presence を購読し、Hubs room の入退室履歴を Supabase `room_entry_events` に保存する Phase 3b 用サイドカーです。

## Local

```bash
npm install
cp .env.example .env
npm run build
npm start
```

## Required Environment

- `RETICULUM_WS_URL`: Reticulum Phoenix socket endpoint. `.../socket` and `.../socket/websocket?vsn=2.0.0` are both accepted.
- `RETICULUM_DB_URL`: read-only Reticulum Postgres URL used to enumerate public hubs.
- `RETICULUM_BOT_ACCESS_KEY`: PEM private key used to sign the Reticulum `perms_token` JWT.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key.
- `DISCORD_ALERT_WEBHOOK_URL`: Discord webhook for operational alerts.

Optional:

- `RETICULUM_HUBS_QUERY`: replaces the default hub enumeration SQL when the Reticulum schema differs.
- `SIDECAR_RECONNECT_MAX_MS`: Phoenix reconnect backoff cap. Default: `60000`.
- `SIDECAR_HEALTH_PORT`: HTTP health server port. Default: `8080`.
- `SIDECAR_LOG_LEVEL`: pino log level. Default: `info`.

## Notes

- The default hub query includes rooms with `entry_mode = 'allow'` and `entry_mode = 'invite'`, and excludes only `deny`.
- The sidecar records session-level rows. Multi-tab users intentionally produce multiple open entries.
- On reconnect, open DB rows missing from the new snapshot are closed with `closed_reason = 'reconnect_reconcile'`.
