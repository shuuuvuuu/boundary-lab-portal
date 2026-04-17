update storage.buckets
set public = false
where id = 'avatars';

drop policy if exists "Public read access" on storage.objects;
drop policy if exists "avatar_select_public" on storage.objects;

create policy "avatars_select_authenticated"
  on storage.objects for select
  using (bucket_id = 'avatars' and auth.uid() is not null);
