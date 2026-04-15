-- Boundary LAB Portal 初期スキーマ
-- profiles: auth.users と 1:1、plan_tier でタブ出し分け
-- calendar_events: 個人予定

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  plan_tier text not null default 'free' check (plan_tier in ('free','standard','professional','enterprise')),
  hubs_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index if not exists calendar_events_user_idx on public.calendar_events (user_id, starts_at);

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- 新規 auth.users 作成時に profiles を自動作成
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.calendar_events enable row level security;

-- profiles: 本人は read/update 可、enterprise は全 read 可
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);

-- NOTE: 「enterprise は全ユーザーの profile を読める」ポリシーは profiles を
-- 自己参照するため RLS 無限再帰を起こす。個別ユーザー行の横断閲覧 UI が
-- 生えるまで削除しておく。将来必要になったら SECURITY DEFINER 関数で実装する。
drop policy if exists profiles_select_enterprise on public.profiles;

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id);

-- calendar_events: 本人のみ全操作
drop policy if exists calendar_events_all_self on public.calendar_events;
create policy calendar_events_all_self on public.calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
