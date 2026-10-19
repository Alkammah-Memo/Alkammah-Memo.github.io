-- Two roles only (admin, manager) and private file storage with a size limit.
update public.profiles set role = 'manager' where role = 'member';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','manager'));
alter table public.profiles alter column role set default 'manager';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, display_name, role)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'display_name', ''),
          case when new.raw_user_meta_data->>'role' = 'admin' then 'admin' else 'manager' end)
  on conflict (user_id) do nothing;
  return new;
end $$;

-- private bucket, 8 MB per file; only signed-in active team members can read, each person writes only into his own folder
insert into storage.buckets (id, name, public, file_size_limit)
values ('team-files', 'team-files', false, 8388608)
on conflict (id) do update set public = false, file_size_limit = 8388608;

drop policy if exists "team_files_read" on storage.objects;
create policy "team_files_read" on storage.objects for select to authenticated
  using (bucket_id = 'team-files' and public.is_active_member());
drop policy if exists "team_files_insert" on storage.objects;
create policy "team_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'team-files' and public.is_active_member() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "team_files_delete" on storage.objects;
create policy "team_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'team-files' and (storage.foldername(name))[1] = auth.uid()::text);
