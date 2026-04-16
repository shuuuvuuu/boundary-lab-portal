drop policy if exists profiles_select_authenticated_public on public.profiles;
create policy profiles_select_authenticated_public on public.profiles
  for select
  using (auth.uid() is not null);

-- 公開列のみ direct SELECT を許可し、自己行の完全プロフィール取得は
-- SECURITY DEFINER 関数経由に分離する。
revoke select on table public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url) on table public.profiles to authenticated;

drop function if exists public.get_current_profile();
create or replace function public.get_current_profile()
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  plan_tier text,
  hubs_account_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profiles.id,
    profiles.email,
    profiles.display_name,
    profiles.avatar_url,
    profiles.plan_tier,
    profiles.hubs_account_id,
    profiles.created_at,
    profiles.updated_at
  from public.profiles
  where profiles.id = auth.uid()
$$;

revoke all on function public.get_current_profile() from public;
grant execute on function public.get_current_profile() to authenticated;
