-- Phase 2.2: Activity Log System
--
-- サーバー / portal で発生する 3 種類のイベント（ユーザー操作・API 呼出・
-- サーバー状態遷移）を 1 テーブルに統合記録する。
-- portal /admin/ops の Activity タブから時系列検索される。
--
-- 書き込みは boundary-server (将来 rezona-server) からサービスロールキーで行い、
-- 読み出しは portal の owner/guest 経由 (API route で制御)。
-- RLS はサービスロールキー前提の運用ですべて deny、API 経由のみアクセス可とする。

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('boundary', 'rezona')),
  event_type text not null check (event_type in ('user_action', 'api_request', 'server_event')),
  action text not null,
  user_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

-- 主な検索パターン:
--   1. 期間内の timeline を新しい順 → occurred_at desc
--   2. service + event_type 絞り込み → 複合
--   3. 特定ユーザーの操作履歴 → user_id + occurred_at
create index if not exists idx_activity_events_occurred_at on public.activity_events (occurred_at desc);
create index if not exists idx_activity_events_service_type_time on public.activity_events (service, event_type, occurred_at desc);
create index if not exists idx_activity_events_user_time on public.activity_events (user_id, occurred_at desc) where user_id is not null;

-- 全レコードに対して RLS 有効、ただしポリシー無しで service_role のみアクセス可。
-- API 経由の読み取りは portal 側で SERVICE_ROLE_KEY を使う（既存 service_health_checks と同方針）。
alter table public.activity_events enable row level security;

comment on table public.activity_events is
  'Phase 2.2: Unified activity log. event_type=user_action/api_request/server_event';
comment on column public.activity_events.service is
  'boundary or rezona (future). Separates per deployed service.';
comment on column public.activity_events.action is
  'Semantic action name (e.g. login, GET /api/xxx, server_boot)';
comment on column public.activity_events.metadata is
  'Arbitrary JSON. For api_request: {status, duration_ms, ip_country?}. For server_event: {pid, release, uptime_sec?}. For user_action: {room_id?, reason?}.';

-- 30 日超のレコードを日次で削除（pg_cron が有効な場合のみ登録される）。
-- Supabase では pg_cron 拡張を Database -> Extensions から有効化する必要あり。
-- 有効化されていない場合はこのブロックは silently fail する（`do` で握りつぶす）。
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- スキーマが cron か extensions によって変わる。Supabase は extensions スキーマ。
    -- 既存 job と同名があれば一度 unschedule してから再作成。
    begin
      perform cron.unschedule('cleanup-activity-events');
    exception when others then null;
    end;
    perform cron.schedule(
      'cleanup-activity-events',
      '0 3 * * *',
      $cron$delete from public.activity_events where occurred_at < now() - interval '30 days'$cron$
    );
  end if;
end $$;
