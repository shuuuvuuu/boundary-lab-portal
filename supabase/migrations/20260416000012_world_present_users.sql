-- 各ワールドに「いま入室中のポータル登録ユーザー」を返す RPC
-- 判定条件:
--   room_entry_events.left_at IS NULL (まだ退出ログなし)
--   room_entry_events.hubs_account_id = profiles.hubs_account_id (portal と Hubs の紐付け)
-- 返却は hub_id 毎に、重複を除いた display_name/avatar_url のセット

create or replace function public.get_world_present_portal_users(target_hub_ids text[])
returns table (
  hub_id text,
  hubs_account_id text,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (room_entry_events.hub_id, room_entry_events.hubs_account_id)
    room_entry_events.hub_id,
    room_entry_events.hubs_account_id,
    profiles.display_name,
    profiles.avatar_url
  from public.room_entry_events
  join public.profiles
    on profiles.hubs_account_id = room_entry_events.hubs_account_id
  where room_entry_events.left_at is null
    and room_entry_events.hub_id = any(coalesce(target_hub_ids, '{}'::text[]))
  order by
    room_entry_events.hub_id,
    room_entry_events.hubs_account_id,
    room_entry_events.entered_at desc
$$;

revoke all on function public.get_world_present_portal_users(text[]) from public;
grant execute on function public.get_world_present_portal_users(text[]) to authenticated;
