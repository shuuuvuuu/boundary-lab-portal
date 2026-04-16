alter table public.profiles
  alter column email drop not null;

update public.profiles
set email = null
where email = '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, nullif(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.sync_profile_email_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = nullif(new.email, '')
  where id = new.id
    and coalesce(email, '') is distinct from coalesce(new.email, '');

  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function public.sync_profile_email_from_auth_user();

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);
