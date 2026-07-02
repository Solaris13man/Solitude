-- Harden push_subscriptions. The original policies granted anon UPDATE/DELETE
-- with using (true), which let anyone holding the public anon key corrupt or
-- wipe the entire table via an unfiltered PATCH/DELETE. Writes now go through
-- two SECURITY DEFINER functions scoped to a single endpoint — push endpoints
-- are unguessable capability URLs, so knowing one proves ownership of it.

revoke insert, update, delete on public.push_subscriptions from anon, authenticated;

drop policy if exists "push insert" on public.push_subscriptions;
drop policy if exists "push update" on public.push_subscriptions;
drop policy if exists "push delete" on public.push_subscriptions;

create or replace function public.upsert_push_subscription(
  _endpoint text,
  _p256dh   text,
  _auth     text,
  _tz       text,
  _hour     smallint
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _endpoint is null or length(_endpoint) = 0 or length(_endpoint) > 1024 then
    raise exception 'invalid endpoint';
  end if;
  if _p256dh is null or length(_p256dh) > 256 or _auth is null or length(_auth) > 256 then
    raise exception 'invalid keys';
  end if;
  if _tz is null or length(_tz) > 64 then
    raise exception 'invalid timezone';
  end if;
  -- the table's hour check constraint (0..23) still applies on top of this
  insert into public.push_subscriptions (endpoint, p256dh, auth, tz, hour)
  values (_endpoint, _p256dh, _auth, _tz, _hour)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth   = excluded.auth,
        tz     = excluded.tz,
        hour   = excluded.hour;
end;
$$;

create or replace function public.delete_push_subscription(_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscriptions where endpoint = _endpoint;
end;
$$;

revoke all on function public.upsert_push_subscription(text, text, text, text, smallint) from public;
grant execute on function public.upsert_push_subscription(text, text, text, text, smallint) to anon, authenticated;
revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.delete_push_subscription(text) to anon, authenticated;
