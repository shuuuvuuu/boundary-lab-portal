drop policy if exists worlds_delete_self on public.worlds;
drop policy if exists worlds_delete_admin on public.worlds;
create policy worlds_delete_admin on public.worlds
  for delete using (public.current_user_is_admin());
