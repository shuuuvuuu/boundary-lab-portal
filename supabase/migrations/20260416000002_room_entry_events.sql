-- Feat-015 Phase 3b: Hubs room entry history

create table if not exists public.room_entry_events (
  id bigserial primary key,
  hub_id text not null check (hub_id ~ '^[A-Za-z0-9]{7}$'),
  session_id text not null,
  reticulum_account_id text,
  hubs_account_id text,
  display_name text,
  anon_id text,
  entered_at timestamptz not null,
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  source text not null check (source in ('diff','snapshot','reconnect_reconcile','stale_on_boot')),
  closed_reason text check (closed_reason in ('leave_diff','reconnect_reconcile','stale_on_boot') or closed_reason is null),
  meta_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists room_entry_events_hub_entered_idx
  on public.room_entry_events (hub_id, entered_at desc);

create index if not exists room_entry_events_open_idx
  on public.room_entry_events (hub_id, left_at)
  where left_at is null;

create index if not exists room_entry_events_account_entered_idx
  on public.room_entry_events (hubs_account_id, entered_at desc)
  where hubs_account_id is not null;

create unique index if not exists room_entry_events_open_session_unique
  on public.room_entry_events (hub_id, session_id)
  where left_at is null;

alter table public.room_entry_events enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and plan_tier = 'enterprise'
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists room_entry_events_admin_select on public.room_entry_events;
create policy room_entry_events_admin_select
  on public.room_entry_events
  for select
  using (public.current_user_is_admin());

comment on table public.room_entry_events is
  'Session-level Hubs room entry history collected from Reticulum Phoenix Presence.';

comment on column public.room_entry_events.meta_snapshot is
  'Raw Reticulum presence meta for short-term debugging. Clear after 30 days by scheduled maintenance.';
