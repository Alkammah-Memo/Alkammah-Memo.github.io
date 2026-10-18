-- Account-level preferences: one row per setting, so changes from different devices never overwrite each other.
-- Used for the Outlook calendar link, the work e-mail invited to meetings, and notification choices.
-- Run once in Supabase Dashboard -> SQL Editor.
create table if not exists public.user_prefs (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  key        text        not null check (char_length(key) between 1 and 64),
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_prefs enable row level security;

drop policy if exists "prefs_select_own" on public.user_prefs;
drop policy if exists "prefs_insert_own" on public.user_prefs;
drop policy if exists "prefs_update_own" on public.user_prefs;
drop policy if exists "prefs_delete_own" on public.user_prefs;
create policy "prefs_select_own" on public.user_prefs for select to authenticated using (user_id = auth.uid());
create policy "prefs_insert_own" on public.user_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "prefs_update_own" on public.user_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "prefs_delete_own" on public.user_prefs for delete to authenticated using (user_id = auth.uid());
