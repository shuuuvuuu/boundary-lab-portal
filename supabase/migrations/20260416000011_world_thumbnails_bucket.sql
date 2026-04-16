-- ワールドサムネイル用 Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'world-thumbnails',
  'world-thumbnails',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS: 認証済みユーザーは自分の <uid>/ フォルダにのみ書込、読み取りは public
drop policy if exists "world_thumb_select_public" on storage.objects;
create policy "world_thumb_select_public"
  on storage.objects for select
  using (bucket_id = 'world-thumbnails');

drop policy if exists "world_thumb_insert_self" on storage.objects;
create policy "world_thumb_insert_self"
  on storage.objects for insert
  with check (
    bucket_id = 'world-thumbnails'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "world_thumb_update_self" on storage.objects;
create policy "world_thumb_update_self"
  on storage.objects for update
  using (
    bucket_id = 'world-thumbnails'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "world_thumb_delete_self" on storage.objects;
create policy "world_thumb_delete_self"
  on storage.objects for delete
  using (
    bucket_id = 'world-thumbnails'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
