-- Alkammah Memo: team (roles, profiles) and chat.
-- Run once in Supabase Dashboard -> SQL Editor. Safe to run again.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  email        text        not null default '',
  display_name text        not null default '' check (char_length(display_name) <= 80),
  phone        text        not null default '' check (char_length(phone) <= 40),
  birthday     text        not null default '' check (birthday = '' or birthday ~ '^\d{4}-\d{2}-\d{2}$'),
  avatar_url   text        not null default '' check (char_length(avatar_url) <= 600),
  role         text        not null default 'member' check (role in ('admin','manager','member')),
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

-- helpers (security definer so policies never recurse into themselves)
create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and active);
$$;
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid() and active;
$$;

drop policy if exists "profiles_read_team" on public.profiles;
create policy "profiles_read_team" on public.profiles for select to authenticated
  using (public.is_active_member() or user_id = auth.uid());

-- people can edit only their own personal fields; role / active / e-mail change only through the admin function
revoke update, insert, delete on public.profiles from authenticated;
grant update (display_name, phone, birthday, avatar_url, updated_at) on public.profiles to authenticated;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- every new login gets a profile automatically
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, display_name, role)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'display_name', ''),
          coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'member'))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- existing logins: the first (oldest) one is the CEO and becomes the administrator
insert into public.profiles (user_id, email, role)
select u.id, coalesce(u.email, ''),
       case when u.id = (select id from auth.users order by created_at asc limit 1) then 'admin' else 'member' end
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------- chat
create table if not exists public.chat_threads (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('direct','group')),
  title           text not null default '' check (char_length(title) <= 120),
  direct_key      text unique,                       -- "<smaller id>:<larger id>" for 1-to-1 chats
  created_by      uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table if not exists public.chat_members (
  thread_id    uuid not null references public.chat_threads(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id);
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.chat_threads(id) on delete cascade,
  sender_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body        text not null default '' check (char_length(body) <= 4000),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10),
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at desc);

alter table public.chat_threads  enable row level security;
alter table public.chat_members  enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_threads, public.chat_members, public.chat_messages from anon;

create or replace function public.is_thread_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_members where thread_id = t and user_id = auth.uid())
     and public.is_active_member();
$$;

drop policy if exists "threads_read" on public.chat_threads;
create policy "threads_read" on public.chat_threads for select to authenticated using (public.is_thread_member(id));

drop policy if exists "members_read" on public.chat_members;
create policy "members_read" on public.chat_members for select to authenticated using (public.is_thread_member(thread_id));
drop policy if exists "members_update_own" on public.chat_members;
create policy "members_update_own" on public.chat_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.chat_members from authenticated;
grant update (last_read_at) on public.chat_members to authenticated;

drop policy if exists "messages_read" on public.chat_messages;
create policy "messages_read" on public.chat_messages for select to authenticated using (public.is_thread_member(thread_id));
drop policy if exists "messages_send" on public.chat_messages;
create policy "messages_send" on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_thread_member(thread_id));
drop policy if exists "messages_delete_own" on public.chat_messages;
create policy "messages_delete_own" on public.chat_messages for delete to authenticated
  using (sender_id = auth.uid() and public.is_thread_member(thread_id));

-- threads are only created through these functions (they check who may talk to whom)
create or replace function public.chat_open_direct(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; tid uuid;
begin
  if me is null or not public.is_active_member() then raise exception 'not allowed'; end if;
  if other = me or not exists (select 1 from public.profiles where user_id = other and active) then raise exception 'unknown person'; end if;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into tid from public.chat_threads where direct_key = k;
  if tid is null then
    insert into public.chat_threads (kind, direct_key, created_by) values ('direct', k, me) returning id into tid;
    insert into public.chat_members (thread_id, user_id) values (tid, me), (tid, other);
  end if;
  return tid;
end $$;

create or replace function public.chat_create_group(title text, members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tid uuid; m uuid;
begin
  if me is null or not public.is_active_member() then raise exception 'not allowed'; end if;
  if coalesce(array_length(members, 1), 0) < 1 or array_length(members, 1) > 60 then raise exception 'pick between 1 and 60 people'; end if;
  insert into public.chat_threads (kind, title, created_by) values ('group', left(coalesce(title, ''), 120), me) returning id into tid;
  insert into public.chat_members (thread_id, user_id) values (tid, me);
  foreach m in array members loop
    if m <> me and exists (select 1 from public.profiles where user_id = m and active) then
      insert into public.chat_members (thread_id, user_id) values (tid, m) on conflict do nothing;
    end if;
  end loop;
  return tid;
end $$;

-- one message to several people: each person gets it in his own private chat with the sender
create or replace function public.chat_broadcast(recipients uuid[], body text, attachments jsonb default '[]'::jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r uuid; tid uuid; n integer := 0;
begin
  if me is null or not public.is_active_member() then raise exception 'not allowed'; end if;
  if public.my_role() not in ('admin','manager') then raise exception 'only administrators and managers can send to several people'; end if;
  if coalesce(array_length(recipients, 1), 0) < 1 or array_length(recipients, 1) > 100 then raise exception 'pick between 1 and 100 people'; end if;
  if char_length(coalesce(body, '')) = 0 and jsonb_array_length(coalesce(attachments, '[]'::jsonb)) = 0 then raise exception 'empty message'; end if;
  foreach r in array recipients loop
    if r <> me and exists (select 1 from public.profiles where user_id = r and active) then
      tid := public.chat_open_direct(r);
      insert into public.chat_messages (thread_id, sender_id, body, attachments) values (tid, me, left(body, 4000), coalesce(attachments, '[]'::jsonb));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.touch_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.chat_threads set last_message_at = new.created_at where id = new.thread_id;
  return new;
end $$;
drop trigger if exists chat_message_touch on public.chat_messages;
create trigger chat_message_touch after insert on public.chat_messages
  for each row execute function public.touch_thread();

revoke all on function public.chat_open_direct(uuid), public.chat_create_group(text, uuid[]), public.chat_broadcast(uuid[], text, jsonb) from public, anon;
grant execute on function public.chat_open_direct(uuid), public.chat_create_group(text, uuid[]), public.chat_broadcast(uuid[], text, jsonb) to authenticated;

-- realtime (row-level security still decides who receives what)
do $$
declare t text;
begin
  foreach t in array array['chat_messages','chat_members','chat_threads','profiles'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
