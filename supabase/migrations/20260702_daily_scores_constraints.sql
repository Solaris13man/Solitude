-- Server-side bounds for leaderboard rows. The 24-char name clamp used to be
-- client-side only, so a crafted request could store an arbitrarily large name
-- (rendering is XSS-escaped, but multi-megabyte names are still abuse). Times
-- get a sanity ceiling of 24h — submitted times remain honor-system beyond that.

update public.daily_scores set name = left(name, 24) where char_length(name) > 24;

alter table public.daily_scores
  drop constraint if exists daily_scores_name_len,
  add constraint daily_scores_name_len check (char_length(name) between 1 and 24);

alter table public.daily_scores
  drop constraint if exists daily_scores_time_sane,
  add constraint daily_scores_time_sane check (time_ms >= 0 and time_ms < 86400000);
