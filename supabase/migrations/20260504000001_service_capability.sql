create table if not exists public.service_capability (
  service text primary key,
  last_seen_at timestamptz not null,
  capabilities jsonb not null,
  updated_at timestamptz default now()
);

create index if not exists idx_service_capability_updated_at
  on public.service_capability(updated_at);

alter table public.service_capability enable row level security;
