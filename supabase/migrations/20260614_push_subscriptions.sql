-- Opt-in daily-reminder web-push subscriptions.
-- Anonymous browsers register/update/remove their own subscription (keyed by
-- the opaque push endpoint). Reading and sending happen only via the service
-- role inside the send-daily-reminders edge function, so anon gets no SELECT.

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  p256dh      text not null,
  auth        text not null,
  tz          text not null default 'UTC',
  hour        smallint not null default 19 check (hour >= 0 and hour <= 23),
  last_sent_on date,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Only insert/update/delete for anon; no select (subscriptions stay private).
grant insert, update, delete on public.push_subscriptions to anon;

drop policy if exists "anon can register" on public.push_subscriptions;
create policy "anon can register" on public.push_subscriptions
  for insert to anon with check (true);

drop policy if exists "anon can update own" on public.push_subscriptions;
create policy "anon can update own" on public.push_subscriptions
  for update to anon using (true) with check (true);

drop policy if exists "anon can remove" on public.push_subscriptions;
create policy "anon can remove" on public.push_subscriptions
  for delete to anon using (true);
