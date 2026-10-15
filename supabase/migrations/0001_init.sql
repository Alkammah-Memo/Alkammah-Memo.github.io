-- Alkammah Memo: schema, row-level security and realtime
-- Run once in Supabase Dashboard -> SQL Editor (or `supabase db push`).

create table if not exists public.workspace_docs (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  collection text        not null check (collection in ('tasks','meetings','notebooks','pages','projects','people')),
  id         text        not null check (char_length(id) between 1 and 128),
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

create index if not exists workspace_docs_user_collection_idx
  on public.workspace_docs (user_id, collection);

create table if not exists public.user_settings (
  user_id    uuid        primary key default auth.uid() references auth.users(id) on delete cascade,
  gemini     jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_docs enable row level security;
alter table public.user_settings  enable row level security;

-- Each user can only ever touch their own rows
drop policy if exists "docs_select_own" on public.workspace_docs;
drop policy if exists "docs_insert_own" on public.workspace_docs;
drop policy if exists "docs_update_own" on public.workspace_docs;
drop policy if exists "docs_delete_own" on public.workspace_docs;
create policy "docs_select_own" on public.workspace_docs for select to authenticated using (user_id = auth.uid());
create policy "docs_insert_own" on public.workspace_docs for insert to authenticated with check (user_id = auth.uid());
create policy "docs_update_own" on public.workspace_docs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "docs_delete_own" on public.workspace_docs for delete to authenticated using (user_id = auth.uid());

drop policy if exists "settings_select_own" on public.user_settings;
drop policy if exists "settings_insert_own" on public.user_settings;
drop policy if exists "settings_update_own" on public.user_settings;
drop policy if exists "settings_delete_own" on public.user_settings;
create policy "settings_select_own" on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy "settings_insert_own" on public.user_settings for insert to authenticated with check (user_id = auth.uid());
create policy "settings_update_own" on public.user_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "settings_delete_own" on public.user_settings for delete to authenticated using (user_id = auth.uid());

-- Nothing is readable without signing in
revoke all on public.workspace_docs from anon;
revoke all on public.user_settings  from anon;

-- Realtime: send full old rows on delete so clients know which document was removed
alter table public.workspace_docs replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_docs'
  ) then
    alter publication supabase_realtime add table public.workspace_docs;
  end if;
end $$;
