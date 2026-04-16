alter table public.calendar_events
  add column if not exists world_id uuid references public.worlds(id) on delete set null;

alter table public.calendar_events
  add column if not exists is_public boolean not null default false;

create index if not exists calendar_events_world_starts_idx
  on public.calendar_events (world_id, starts_at asc)
  where world_id is not null;

create index if not exists calendar_events_public_starts_idx
  on public.calendar_events (is_public, starts_at asc)
  where is_public = true;

create or replace function public.get_public_profiles(profile_ids uuid[])
returns table (
  id uuid,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profiles.id,
    profiles.display_name,
    profiles.avatar_url
  from public.profiles
  where profiles.id = any(coalesce(profile_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_public_profiles(uuid[]) from public;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;

drop policy if exists calendar_events_all_self on public.calendar_events;

drop policy if exists calendar_events_select_self on public.calendar_events;
create policy calendar_events_select_self on public.calendar_events
  for select using (auth.uid() = user_id);

drop policy if exists calendar_events_select_public on public.calendar_events;
create policy calendar_events_select_public on public.calendar_events
  for select using (is_public = true);

drop policy if exists calendar_events_insert_self on public.calendar_events;
create policy calendar_events_insert_self on public.calendar_events
  for insert with check (auth.uid() = user_id);

drop policy if exists calendar_events_update_self on public.calendar_events;
create policy calendar_events_update_self on public.calendar_events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists calendar_events_delete_self on public.calendar_events;
create policy calendar_events_delete_self on public.calendar_events
  for delete using (auth.uid() = user_id);
