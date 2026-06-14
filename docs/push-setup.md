# Daily-reminder web push — setup

The client (opt-in toggle on `/daily-challenge/`), the service-worker push
handlers, and the Supabase artifacts are all in the repo. Push stays dormant
until you finish these steps and flip the flag.

## 1. Apply the migration

`supabase/migrations/20260614_push_subscriptions.sql` creates the
`push_subscriptions` table with RLS (anon may register/update/remove their own
subscription; only the edge function reads/sends via the service role).

## 2. Set the VAPID secrets

A VAPID keypair was generated during setup. The **public** key is already in
`src/lib/site-config.ts` (`push.vapidPublicKey`) — it's safe to ship. The
**private** key must never be committed; set it (and the others) as edge-function
secrets:

```
VAPID_PUBLIC_KEY   = <the public key from site-config.ts>
VAPID_PRIVATE_KEY  = <the private key — kept out of the repo; see handoff notes>
VAPID_SUBJECT      = mailto:hello@cardhearth.com
```

If you ever rotate the keypair, regenerate both and update site-config + secrets
together.

## 3. Deploy the edge function

`supabase/functions/send-daily-reminders/` sends one reminder per due
subscription. Deploy it, then verify a manual invoke returns
`{ ok: true, ... }`.

## 4. Schedule it hourly (cron)

Run the function once an hour so each user is reminded at their chosen local
hour. With `pg_cron` + `pg_net` (store the service key in Vault, don't inline it):

```sql
select cron.schedule(
  'send-daily-reminders-hourly',
  '0 * * * *',
  $$ select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/send-daily-reminders',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
         'Content-Type', 'application/json'),
       body := '{}'::jsonb
     ); $$
);
```

## 5. Flip the flag

Set `push.enabled = true` in `src/lib/site-config.ts` and deploy. The reminder
toggle now appears on `/daily-challenge/` for browsers that support push.

## How it behaves

- Off by default; users opt in and pick a local hour.
- At most one reminder per day, at the chosen hour in the user's timezone.
- The service worker suppresses the notification if today's daily is already
  solved (mirrored to Cache Storage by the client).
- Expired subscriptions (404/410) are pruned automatically.
