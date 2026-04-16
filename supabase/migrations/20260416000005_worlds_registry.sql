create table if not exists public.worlds (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('hubs', 'vrchat', 'spatial', 'other')),
  external_id text not null,
  url text not null,
  name text not null,
  description text,
  thumbnail_url text,
  tags text[] not null default '{}'::text[],
  added_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_id)
);

create table if not exists public.user_favorite_worlds (
  user_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  note text,
  is_recommended boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, world_id)
);

create table if not exists public.world_reviews (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  unique (world_id, user_id)
);

create index if not exists worlds_platform_created_idx
  on public.worlds (platform, created_at desc);

create index if not exists worlds_tags_gin_idx
  on public.worlds using gin (tags);

create index if not exists user_favorite_worlds_world_recommended_idx
  on public.user_favorite_worlds (world_id, is_recommended);

create index if not exists world_reviews_world_idx
  on public.world_reviews (world_id, created_at desc);

drop trigger if exists worlds_set_updated_at on public.worlds;
create trigger worlds_set_updated_at
  before update on public.worlds
  for each row execute function public.set_updated_at();

alter table public.worlds enable row level security;
alter table public.user_favorite_worlds enable row level security;
alter table public.world_reviews enable row level security;

drop policy if exists worlds_select_authenticated on public.worlds;
create policy worlds_select_authenticated
  on public.worlds
  for select
  using (auth.uid() is not null);

drop policy if exists worlds_insert_self on public.worlds;
create policy worlds_insert_self
  on public.worlds
  for insert
  with check (auth.uid() = added_by);

drop policy if exists worlds_update_self on public.worlds;
create policy worlds_update_self
  on public.worlds
  for update
  using (auth.uid() = added_by)
  with check (auth.uid() = added_by);

drop policy if exists worlds_delete_self on public.worlds;
create policy worlds_delete_self
  on public.worlds
  for delete
  using (auth.uid() = added_by);

drop policy if exists user_favorite_worlds_select_visible on public.user_favorite_worlds;
create policy user_favorite_worlds_select_visible
  on public.user_favorite_worlds
  for select
  using (auth.uid() = user_id or is_recommended = true);

drop policy if exists user_favorite_worlds_insert_self on public.user_favorite_worlds;
create policy user_favorite_worlds_insert_self
  on public.user_favorite_worlds
  for insert
  with check (auth.uid() = user_id);

drop policy if exists user_favorite_worlds_update_self on public.user_favorite_worlds;
create policy user_favorite_worlds_update_self
  on public.user_favorite_worlds
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_favorite_worlds_delete_self on public.user_favorite_worlds;
create policy user_favorite_worlds_delete_self
  on public.user_favorite_worlds
  for delete
  using (auth.uid() = user_id);

drop policy if exists world_reviews_select_authenticated on public.world_reviews;
create policy world_reviews_select_authenticated
  on public.world_reviews
  for select
  using (auth.uid() is not null);

drop policy if exists world_reviews_insert_self on public.world_reviews;
create policy world_reviews_insert_self
  on public.world_reviews
  for insert
  with check (auth.uid() = user_id);

drop policy if exists world_reviews_update_self on public.world_reviews;
create policy world_reviews_update_self
  on public.world_reviews
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists world_reviews_delete_self on public.world_reviews;
create policy world_reviews_delete_self
  on public.world_reviews
  for delete
  using (auth.uid() = user_id);
