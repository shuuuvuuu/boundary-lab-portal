create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_worlds (
  collection_id uuid not null references public.collections(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, world_id)
);

create index if not exists collections_owner_created_idx
  on public.collections (owner_id, created_at desc);

create index if not exists collections_public_created_idx
  on public.collections (is_public, created_at desc);

create index if not exists collection_worlds_world_idx
  on public.collection_worlds (world_id, added_at desc);

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

alter table public.collections enable row level security;
alter table public.collection_worlds enable row level security;

create or replace function public.current_user_owns_collection(target_collection_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.collections
    where id = target_collection_id
      and owner_id = auth.uid()
  );
$$;

create or replace function public.current_user_can_view_collection(target_collection_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.collections
    where id = target_collection_id
      and (
        is_public = true
        or owner_id = auth.uid()
        or public.current_user_is_admin()
      )
  );
$$;

create or replace function public.current_user_can_manage_collection(target_collection_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.collections
    where id = target_collection_id
      and (
        owner_id = auth.uid()
        or public.current_user_is_admin()
      )
  );
$$;

revoke all on function public.current_user_owns_collection(uuid) from public;
grant execute on function public.current_user_owns_collection(uuid) to authenticated;

revoke all on function public.current_user_can_view_collection(uuid) from public;
grant execute on function public.current_user_can_view_collection(uuid) to authenticated;

revoke all on function public.current_user_can_manage_collection(uuid) from public;
grant execute on function public.current_user_can_manage_collection(uuid) to authenticated;

drop policy if exists collections_select_visible on public.collections;
create policy collections_select_visible
  on public.collections
  for select
  using (
    is_public = true
    or owner_id = auth.uid()
    or public.current_user_is_admin()
  );

drop policy if exists collections_insert_self on public.collections;
create policy collections_insert_self
  on public.collections
  for insert
  with check (owner_id = auth.uid());

drop policy if exists collections_update_owner on public.collections;
create policy collections_update_owner
  on public.collections
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists collections_delete_owner_or_admin on public.collections;
create policy collections_delete_owner_or_admin
  on public.collections
  for delete
  using (
    owner_id = auth.uid()
    or public.current_user_is_admin()
  );

drop policy if exists collection_worlds_select_visible on public.collection_worlds;
create policy collection_worlds_select_visible
  on public.collection_worlds
  for select
  using (public.current_user_can_view_collection(collection_id));

drop policy if exists collection_worlds_insert_manageable on public.collection_worlds;
create policy collection_worlds_insert_manageable
  on public.collection_worlds
  for insert
  with check (public.current_user_can_manage_collection(collection_id));

drop policy if exists collection_worlds_delete_manageable on public.collection_worlds;
create policy collection_worlds_delete_manageable
  on public.collection_worlds
  for delete
  using (public.current_user_can_manage_collection(collection_id));
