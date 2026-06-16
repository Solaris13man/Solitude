-- Daily Challenge leaderboard.
-- The daily is a single shared, deterministic puzzle per UTC day (the deal seed
-- is the date itself), so every player's time is directly comparable. Signed-in
-- players submit their best result for a day; the board is publicly readable
-- (first name + time only) so anyone can see the day's fastest solves.

create table if not exists public.daily_scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  game       text not null,
  time_ms    integer not null check (time_ms >= 0),
  moves      integer not null default 0,
  score      integer not null default 0,
  name       text not null default 'Player',
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists daily_scores_day_time on public.daily_scores (day, time_ms);

alter table public.daily_scores enable row level security;

-- The board is public to read (just a first name + time/moves), so anon and
-- authenticated can SELECT. Only authenticated users can write, and only their
-- own row (auth.uid() = user_id), so nobody can post a time as someone else.
grant select on public.daily_scores to anon, authenticated;
grant insert, update on public.daily_scores to authenticated;

drop policy if exists "scores readable" on public.daily_scores;
drop policy if exists "insert own score" on public.daily_scores;
drop policy if exists "update own score" on public.daily_scores;

create policy "scores readable" on public.daily_scores
  for select to anon, authenticated using (true);
create policy "insert own score" on public.daily_scores
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own score" on public.daily_scores
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
