-- Phase A3: scheduler / log ingest / TODO 関連テーブル
--
-- 1) job_runs:        cron / scheduled job の実行履歴
-- 2) service_logs:    rezona など外部サービスから受信する pino ログ
-- 3) ops_todos:       代表用の運用 TODO リスト (期限通知ジョブが参照)
--
-- 既存方針に合わせて RLS は有効、ポリシーは定義しない (service_role 経由のみアクセス可)。

-- ----------------------------------------------------------------------------
-- 1) job_runs
-- ----------------------------------------------------------------------------
create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  job_kind text not null check (job_kind in ('cron', 'scheduled')),
  trigger text not null check (trigger in ('scheduled', 'manual', 'boot')),
  status text not null check (status in ('running', 'ok', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  message text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_job_runs_started_at
  on public.job_runs (started_at desc);
create index if not exists idx_job_runs_job_name_started_at
  on public.job_runs (job_name, started_at desc);
create index if not exists idx_job_runs_status_started_at
  on public.job_runs (status, started_at desc);

alter table public.job_runs enable row level security;

comment on table public.job_runs is
  'Phase A3: portal scheduler の cron / scheduled job 実行ログ';

-- ----------------------------------------------------------------------------
-- 2) service_logs
-- ----------------------------------------------------------------------------
create table if not exists public.service_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  level text not null check (level in ('debug', 'info', 'warn', 'error', 'fatal')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_service_logs_occurred_at
  on public.service_logs (occurred_at desc);
create index if not exists idx_service_logs_source_level_time
  on public.service_logs (source, level, occurred_at desc);
create index if not exists idx_service_logs_source_time
  on public.service_logs (source, occurred_at desc);

alter table public.service_logs enable row level security;

comment on table public.service_logs is
  'Phase A3: 外部サービス (rezona 等) の pino ログ受信先。/api/logs/ingest からの insert を想定';

-- ----------------------------------------------------------------------------
-- 3) ops_todos
-- ----------------------------------------------------------------------------
create table if not exists public.ops_todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ops_todos_status_due_at
  on public.ops_todos (status, due_at)
  where status = 'open';
create index if not exists idx_ops_todos_due_at
  on public.ops_todos (due_at)
  where due_at is not null;

alter table public.ops_todos enable row level security;

comment on table public.ops_todos is
  'Phase A3: 代表が portal /admin/ops で管理する運用 TODO。todo-notify ジョブが期限間近を Discord 通知';

-- ----------------------------------------------------------------------------
-- 4) ジョブ実行ログ retention (pg_cron 環境のみ)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('cleanup-job-runs');
    exception when others then null;
    end;
    -- 90 日 (jobs ログ) / 30 日 (service_logs)
    perform cron.schedule(
      'cleanup-job-runs',
      '15 3 * * *',
      $cron$delete from public.job_runs where started_at < now() - interval '90 days'$cron$
    );
    begin
      perform cron.unschedule('cleanup-service-logs');
    exception when others then null;
    end;
    perform cron.schedule(
      'cleanup-service-logs',
      '20 3 * * *',
      $cron$delete from public.service_logs where occurred_at < now() - interval '30 days'$cron$
    );
  end if;
end $$;
