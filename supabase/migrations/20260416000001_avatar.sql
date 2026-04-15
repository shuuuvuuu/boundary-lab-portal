-- プロフィールにアバター URL カラム追加
alter table public.profiles
  add column if not exists avatar_url text;

-- Storage bucket (public read、認証ユーザーが自分のフォルダにのみ書き込み可)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS: 誰でも読める / 自分の <uid>/ フォルダにのみ書き込み・更新・削除可
drop policy if exists "avatar_select_public" on storage.objects;
create policy "avatar_select_public" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatar_insert_self" on storage.objects;
create policy "avatar_insert_self" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatar_update_self" on storage.objects;
create policy "avatar_update_self" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatar_delete_self" on storage.objects;
create policy "avatar_delete_self" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
