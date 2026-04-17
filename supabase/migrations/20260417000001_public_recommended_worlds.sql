create or replace function public.get_public_recommended_worlds()
returns table (
  id uuid,
  platform text,
  url text,
  name text,
  description text,
  thumbnail_url text,
  tags text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.platform, w.url, w.name, w.description, w.thumbnail_url, w.tags
  from public.worlds w
  join (
    select world_id, count(*)::int as rec_count
    from public.user_favorite_worlds
    where is_recommended = true
    group by world_id
    having count(*) >= 1
  ) r on r.world_id = w.id
$$;

revoke all on function public.get_public_recommended_worlds() from public;
grant execute on function public.get_public_recommended_worlds() to anon, authenticated;
