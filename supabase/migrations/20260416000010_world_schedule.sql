alter table public.worlds
  add column if not exists recurring_schedule text;

alter table public.worlds
  add column if not exists next_event_at timestamptz;

create index if not exists worlds_next_event_idx
  on public.worlds (next_event_at asc)
  where next_event_at is not null;

create or replace function public.get_world_active_user_counts(target_hub_ids text[])
returns table (
  hub_id text,
  active_user_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    room_entry_events.hub_id,
    count(*)::bigint as active_user_count
  from public.room_entry_events
  where room_entry_events.left_at is null
    and room_entry_events.hub_id = any(coalesce(target_hub_ids, '{}'::text[]))
  group by room_entry_events.hub_id
$$;

create or replace function public.get_world_visit_stats(
  target_hubs_account_id text,
  target_hub_ids text[]
)
returns table (
  hub_id text,
  visit_count bigint,
  last_visited_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    room_entry_events.hub_id,
    count(*)::bigint as visit_count,
    max(room_entry_events.entered_at) as last_visited_at
  from public.room_entry_events
  where target_hubs_account_id is not null
    and room_entry_events.hubs_account_id = target_hubs_account_id
    and room_entry_events.hub_id = any(coalesce(target_hub_ids, '{}'::text[]))
  group by room_entry_events.hub_id
$$;

revoke all on function public.get_world_active_user_counts(text[]) from public;
grant execute on function public.get_world_active_user_counts(text[]) to authenticated;

revoke all on function public.get_world_visit_stats(text, text[]) from public;
grant execute on function public.get_world_visit_stats(text, text[]) to authenticated;
