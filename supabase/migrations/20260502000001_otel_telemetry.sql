-- B1.5 OTel pivot 受け皿
--
-- OTel Collector が将来 forward する logs / traces / metrics を Supabase に保存する。
-- portal API (B1.5-D) で書き込み開始予定。
--
-- 書き込みは portal API からサービスロールキーで行う想定。
-- RLS はサービスロールキー前提の運用ですべて deny、API 経由のみアクセス可とする。

create table if not exists public.otel_logs (
  id uuid primary key default gen_random_uuid(),
  observed_timestamp timestamptz not null default now(),
  timestamp timestamptz,
  trace_id text,
  span_id text,
  severity_text text,
  severity_number smallint check (severity_number is null or severity_number between 1 and 24),
  service_name text not null,
  body text,
  resource_attributes jsonb not null default '{}'::jsonb,
  log_attributes jsonb not null default '{}'::jsonb
);

create table if not exists public.otel_traces (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null,
  span_id text not null,
  parent_span_id text,
  service_name text not null,
  span_name text not null,
  span_kind text check (span_kind is null or span_kind in ('internal', 'server', 'client', 'producer', 'consumer')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_ms numeric generated always as (extract(epoch from (end_time - start_time)) * 1000) stored,
  status_code text check (status_code is null or status_code in ('unset', 'ok', 'error')),
  status_message text,
  resource_attributes jsonb not null default '{}'::jsonb,
  span_attributes jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb
);

create table if not exists public.otel_metrics (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  metric_name text not null,
  metric_description text,
  metric_unit text,
  metric_type text not null check (metric_type in ('gauge', 'sum', 'histogram', 'summary')),
  timestamp timestamptz not null,
  value numeric,
  count bigint,
  sum numeric,
  bucket_bounds numeric[],
  bucket_counts bigint[],
  resource_attributes jsonb not null default '{}'::jsonb,
  metric_attributes jsonb not null default '{}'::jsonb
);

-- 主な検索パターン:
--   1. service ごとのログ時系列表示 → service_name + timestamp desc
--   2. trace_id から関連ログを検索 → trace_id（存在する場合のみ）
create index if not exists idx_otel_logs_service_timestamp
  on public.otel_logs (service_name, timestamp desc);
create index if not exists idx_otel_logs_trace_id
  on public.otel_logs (trace_id)
  where trace_id is not null;

-- 主な検索パターン:
--   1. trace_id から span 一式を検索 → trace_id
--   2. service ごとの span 時系列表示 → service_name + start_time desc
create index if not exists idx_otel_traces_trace_id
  on public.otel_traces (trace_id);
create index if not exists idx_otel_traces_service_start_time
  on public.otel_traces (service_name, start_time desc);

-- 主な検索パターン:
--   1. service / metric ごとの時系列表示 → service_name + metric_name + timestamp desc
create index if not exists idx_otel_metrics_service_metric_timestamp
  on public.otel_metrics (service_name, metric_name, timestamp desc);

-- 全レコードに対して RLS 有効、ただしポリシー無しで service_role のみアクセス可。
-- API 経由の読み書きは portal 側で SERVICE_ROLE_KEY を使う（service_metrics と同方針）。
alter table public.otel_logs enable row level security;
alter table public.otel_traces enable row level security;
alter table public.otel_metrics enable row level security;

comment on table public.otel_logs is
  'B1.5: OTel Collector から転送されるログレコードの保存先。';
comment on column public.otel_logs.id is
  'ログ行の一意識別子。';
comment on column public.otel_logs.observed_timestamp is
  'Collector または portal API がログを観測・保存した UTC 時刻。';
comment on column public.otel_logs.timestamp is
  'ログイベントが発生した UTC 時刻。上流で未設定の場合は null。';
comment on column public.otel_logs.trace_id is
  'ログに関連付けられた OTel trace_id。';
comment on column public.otel_logs.span_id is
  'ログに関連付けられた OTel span_id。';
comment on column public.otel_logs.severity_text is
  'OTel の severity text。例: INFO, WARN, ERROR。';
comment on column public.otel_logs.severity_number is
  'OTel SeverityNumber。仕様上の範囲は 1 から 24。';
comment on column public.otel_logs.service_name is
  'resource attributes から抽出した service.name。';
comment on column public.otel_logs.body is
  'ログ本文。';
comment on column public.otel_logs.resource_attributes is
  'OTel resource attributes の JSON。';
comment on column public.otel_logs.log_attributes is
  'OTel log record attributes の JSON。';

comment on table public.otel_traces is
  'B1.5: OTel Collector から転送される trace span レコードの保存先。';
comment on column public.otel_traces.id is
  'span 行の一意識別子。';
comment on column public.otel_traces.trace_id is
  'OTel trace_id。';
comment on column public.otel_traces.span_id is
  'OTel span_id。';
comment on column public.otel_traces.parent_span_id is
  '親 span の span_id。root span の場合は null。';
comment on column public.otel_traces.service_name is
  'resource attributes から抽出した service.name。';
comment on column public.otel_traces.span_name is
  'OTel span name。';
comment on column public.otel_traces.span_kind is
  'OTel span kind。internal / server / client / producer / consumer のいずれか。';
comment on column public.otel_traces.start_time is
  'span の開始 UTC 時刻。';
comment on column public.otel_traces.end_time is
  'span の終了 UTC 時刻。';
comment on column public.otel_traces.duration_ms is
  'start_time と end_time から生成される span duration（ミリ秒）。';
comment on column public.otel_traces.status_code is
  'OTel span status code。unset / ok / error のいずれか。';
comment on column public.otel_traces.status_message is
  'OTel span status message。';
comment on column public.otel_traces.resource_attributes is
  'OTel resource attributes の JSON。';
comment on column public.otel_traces.span_attributes is
  'OTel span attributes の JSON。';
comment on column public.otel_traces.events is
  'OTel span events の JSON 配列。';
comment on column public.otel_traces.links is
  'OTel span links の JSON 配列。';

comment on table public.otel_metrics is
  'B1.5: OTel Collector から転送される metric datapoint レコードの保存先。';
comment on column public.otel_metrics.id is
  'metric 行の一意識別子。';
comment on column public.otel_metrics.service_name is
  'resource attributes から抽出した service.name。';
comment on column public.otel_metrics.metric_name is
  'OTel metric name。';
comment on column public.otel_metrics.metric_description is
  'OTel metric description。';
comment on column public.otel_metrics.metric_unit is
  'OTel metric unit。';
comment on column public.otel_metrics.metric_type is
  'OTel metric type。gauge / sum / histogram / summary のいずれか。';
comment on column public.otel_metrics.timestamp is
  'metric datapoint の UTC 時刻。';
comment on column public.otel_metrics.value is
  'gauge / sum の値。';
comment on column public.otel_metrics.count is
  'histogram datapoint の count。';
comment on column public.otel_metrics.sum is
  'histogram datapoint の sum。';
comment on column public.otel_metrics.bucket_bounds is
  'histogram bucket の上限値配列。';
comment on column public.otel_metrics.bucket_counts is
  'histogram bucket の count 配列。';
comment on column public.otel_metrics.resource_attributes is
  'OTel resource attributes の JSON。';
comment on column public.otel_metrics.metric_attributes is
  'OTel metric datapoint attributes の JSON。';

-- logs / traces は 7 日超、metrics は service_metrics と同じ 30 日超のレコードを日次で削除する。
-- pg_cron が有効な場合のみ登録される。Supabase では Database -> Extensions から有効化する必要あり。
-- 有効化されていない場合はこのブロックは silently fail する（`do` で握りつぶす）。
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- スキーマが cron か extensions によって変わる。Supabase は extensions スキーマ。
    -- 既存 job と同名があれば一度 unschedule してから再作成。
    begin
      perform cron.unschedule('cleanup-otel-logs');
    exception when others then null;
    end;
    perform cron.schedule(
      'cleanup-otel-logs',
      '35 3 * * *',
      $cron$delete from public.otel_logs where observed_timestamp < now() - interval '7 days'$cron$
    );

    begin
      perform cron.unschedule('cleanup-otel-traces');
    exception when others then null;
    end;
    perform cron.schedule(
      'cleanup-otel-traces',
      '40 3 * * *',
      $cron$delete from public.otel_traces where start_time < now() - interval '7 days'$cron$
    );

    begin
      perform cron.unschedule('cleanup-otel-metrics');
    exception when others then null;
    end;
    perform cron.schedule(
      'cleanup-otel-metrics',
      '30 3 * * *',
      $cron$delete from public.otel_metrics where timestamp < now() - interval '30 days'$cron$
    );
  end if;
end $$;
