-- Long-lived Google Calendar refresh tokens. Only the Edge Function (service role) can read or write this table:
-- row level security is on and there are no policies, so the browser can never see it.
create table if not exists public.google_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  email         text,
  updated_at    timestamptz not null default now()
);
alter table public.google_tokens enable row level security;
revoke all on public.google_tokens from anon, authenticated;
