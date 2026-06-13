-- CardHearth account sync schema.
--
-- Run this once in the Supabase SQL editor after creating a project, then:
--   1. Authentication → Providers → enable Google (add your Google OAuth
--      client id + secret from the Google Cloud Console).
--   2. Authentication → URL Configuration → add your site URL + the deployed
--      origin to the redirect allow-list.
--   3. Put the project URL + anon key into src/lib/site-config.ts and set
--      accounts.enabled = true.
--
-- A single row per user holds their merged progress as JSON. Row-level
-- security ensures a signed-in user can only read/write their own row, so the
-- public anon key is safe in the browser.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "own profile insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "own profile update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
