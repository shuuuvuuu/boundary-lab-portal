-- Phase 3: Service metrics time series
--
-- boundary-server / rezona-server の internal metrics endpoint から取得した
-- process / rooms / users のスナップショットを時系列で保存する。
--
-- 書き込みは portal の metrics-poller からサービスロールキーで行う。
-- RLS はサービスロールキー前提の運用ですべて deny、API 経由のみアクセス可とする。

create table if not exists public.service_metrics (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  server_id text,
  kind text not null check (kind in ('process', 'rooms', 'users')),
  captured_at timestamptz not null default now(),
  data jsonb not null
);

-- 主な検索パターン:
--   1. service ごとの時系列表示 → service + captured_at desc
--   2. kind ごとの横断表示 → kind + captured_at desc
create index if not exists idx_service_metrics_service_time on public.service_metrics (service, captured_at desc);
create index if not exists idx_service_metrics_kind_time on public.service_metrics (kind, captured_at desc);

-- 全レコードに対して RLS 有効、ただしポリシー無しで service_role のみアクセス可。
-- API 経由の読み取りは portal 側で SERVICE_ROLE_KEY を使う（activity_events と同方針）。
alter table public.service_metrics enable row level security;

comment on table public.service_metrics is
  'Phase 3: Time-series metrics snapshots from boundary-server / rezona-server.';
comment on column public.service_metrics.service is
  'Source service name, e.g. boundary-server or rezona-server.';
comment on column public.service_metrics.server_id is
  'Optional upstream server identifier from the metrics response.';
comment on column public.service_metrics.kind is
  'Metric family: process, rooms, or users.';
comment on column public.service_metrics.captured_at is
  'UTC timestamp when the metrics snapshot was stored.';
comment on column public.service_metrics.data is
  'Normalized metrics JSON. process rows keep only the latest sample from upstream samples.';

-- 30 日超のレコードを日次で削除（pg_cron が有効な場合のみ登録される）。
-- Supabase では pg_cron 拡張を Database -> Extensions から有効化する必要あり。
-- 有効化されていない場合はこのブロックは silently fail する（`do` で握りつぶす）。
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- スキーマが cron か extensions によって変わる。Supabase は extensions スキーマ。
    -- 既存 job と同名があれば一度 unschedule してから再作成。
    begin
      perform cron.unschedule('cleanup-service-metrics');
    exception when others then null;
    end;
    perform cron.schedule(
      'cleanup-service-metrics',
      '30 3 * * *',
      $cron$delete from public.service_metrics where captured_at < now() - interval '30 days'$cron$
    );
  end if;
end $$;
