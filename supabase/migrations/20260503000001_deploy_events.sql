create table if not exists public.deploy_events (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  server_id text not null,
  release text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  event_count integer not null default 0,
  context jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service, server_id)
);

create index if not exists idx_deploy_events_service_first_seen
  on public.deploy_events (service, first_seen_at desc);
create index if not exists idx_deploy_events_last_seen
  on public.deploy_events (last_seen_at desc);

alter table public.deploy_events enable row level security;
-- RLS 有効、ポリシーは追加しない（service_role のみアクセス）

comment on table public.deploy_events is
  'service_logs.context.server_id の出現を deploy/restart イベントとして集約。最初に観測した時刻と最後に観測した時刻、観測されたログ件数を保持する。';
