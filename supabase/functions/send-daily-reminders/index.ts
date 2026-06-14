// Supabase Edge Function: send-daily-reminders
//
// Invoke hourly (cron). For each opt-in subscription whose chosen local hour
// matches the current hour in its timezone and that hasn't been reminded today,
// send one gentle web-push reminder, then stamp last_sent_on. Expired
// subscriptions (404/410) are deleted. The service worker suppresses the
// notification if the player has already solved today's daily.
//
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (e.g. "mailto:hello@cardhearth.com"). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface Sub {
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
  hour: number;
  last_sent_on: string | null;
}

const PAYLOAD = JSON.stringify({
  title: 'CardHearth Daily Challenge',
  body: "Today's Daily Challenge is ready — keep your streak going!",
  url: '/daily-challenge/',
});

function localParts(tz: string): { hour: number; date: string } {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(now),
  );
  // en-CA gives an ISO-style YYYY-MM-DD local date.
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  return { hour: hour % 24, date };
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@cardhearth.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );

  const { data, error } = await supabase.from('push_subscriptions').select('*');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const subs = (data ?? []) as Sub[];
  let sent = 0;
  let removed = 0;

  for (const sub of subs) {
    let parts;
    try {
      parts = localParts(sub.tz || 'UTC');
    } catch {
      parts = localParts('UTC');
    }
    if (parts.hour !== sub.hour) continue;
    if (sub.last_sent_on === parts.date) continue;

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        PAYLOAD,
      );
      await supabase
        .from('push_subscriptions')
        .update({ last_sent_on: parts.date })
        .eq('endpoint', sub.endpoint);
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        removed++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, total: subs.length, sent, removed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
