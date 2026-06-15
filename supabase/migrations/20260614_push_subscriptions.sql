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

-- Browsers register/update/remove their own subscription (keyed by the opaque
-- push endpoint). Granted to both anon and authenticated, and policies target
-- `public` so they apply whatever role the request runs as. No select — only
-- the service role (in the edge function) reads/sends, so subscriptions stay
-- private.
grant insert, update, delete on public.push_subscriptions to anon, authenticated;

drop policy if exists "anon can register" on public.push_subscriptions;
drop policy if exists "anon can update own" on public.push_subscriptions;
drop policy if exists "anon can remove" on public.push_subscriptions;
drop policy if exists "push insert" on public.push_subscriptions;
drop policy if exists "push update" on public.push_subscriptions;
drop policy if exists "push delete" on public.push_subscriptions;

create policy "push insert" on public.push_subscriptions for insert to public with check (true);
create policy "push update" on public.push_subscriptions for update to public using (true) with check (true);
create policy "push delete" on public.push_subscriptions for delete to public using (true);
