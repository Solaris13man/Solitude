import { SITE_CONFIG } from './site-config';
import { isDailySolved, utcDateKey } from './daily';

/**
 * Opt-in daily-reminder web push (off by default). The browser subscribes via
 * the service worker and the subscription is stored in Supabase; a scheduled
 * edge function sends one gentle reminder per day at the user's chosen local
 * hour. Everything here no-ops unless SITE_CONFIG.push.enabled is true.
 */

const PREF_KEY = 'cardhearth.push.pref.v1';
const SOLVED_CACHE = 'cardhearth-daily';
const SOLVED_URL = '/__daily_solved';

export interface ReminderPref {
  enabled: boolean;
  hour: number; // preferred local hour, 0–23
}

export interface ReminderState {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | 'unsupported';
  pref: ReminderPref;
}

export function pushConfigured(): boolean {
  const p = SITE_CONFIG.push;
  return p.enabled && !!p.vapidPublicKey && !!SITE_CONFIG.accounts.supabaseUrl;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function loadPref(): ReminderPref {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { enabled: false, hour: 19, ...(JSON.parse(raw) as Partial<ReminderPref>) };
  } catch {
    /* ignore */
  }
  return { enabled: false, hour: 19 };
}

function savePref(pref: ReminderPref): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(pref));
  } catch {
    /* ignore */
  }
}

export function reminderState(): ReminderState {
  const supported = pushSupported();
  return {
    supported,
    configured: pushConfigured(),
    permission: supported ? Notification.permission : 'unsupported',
    pref: loadPref(),
  };
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const restHeaders = () => ({
  apikey: SITE_CONFIG.accounts.supabaseAnonKey,
  Authorization: `Bearer ${SITE_CONFIG.accounts.supabaseAnonKey}`,
  'Content-Type': 'application/json',
});

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
}

/** Turn the reminder on: request permission, subscribe, and store it. */
export async function enableReminder(hour: number): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  if (!pushSupported() || !pushConfigured()) return 'unsupported';
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  try {
    const reg = await getRegistration();
    if (!reg) return 'error';
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(SITE_CONFIG.push.vapidPublicKey),
      }));
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const body = {
      endpoint: sub.endpoint,
      p256dh: keyToBase64(sub.getKey('p256dh')),
      auth: keyToBase64(sub.getKey('auth')),
      tz,
      hour,
    };
    const res = await fetch(`${SITE_CONFIG.accounts.supabaseUrl}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: { ...restHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return 'error';
    savePref({ enabled: true, hour });
    return 'ok';
  } catch {
    return 'error';
  }
}

/** Update the reminder hour for an already-enabled subscription. */
export async function updateReminderHour(hour: number): Promise<void> {
  const pref = loadPref();
  savePref({ ...pref, hour });
  if (pref.enabled) await enableReminder(hour); // re-upsert with the new hour
}

/** Turn the reminder off: unsubscribe and remove the stored subscription. */
export async function disableReminder(): Promise<void> {
  savePref({ ...loadPref(), enabled: false });
  try {
    const reg = await getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch(
        `${SITE_CONFIG.accounts.supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
        { method: 'DELETE', headers: restHeaders() },
      );
    }
  } catch {
    /* best effort */
  }
}

/**
 * Mirror today's daily-solved state into the Cache Storage so the service
 * worker can suppress a reminder you no longer need. Safe to call on every load.
 */
export async function syncDailySolvedCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(SOLVED_CACHE);
    if (isDailySolved()) {
      await cache.put(SOLVED_URL, new Response(utcDateKey()));
    } else {
      await cache.delete(SOLVED_URL);
    }
  } catch {
    /* ignore */
  }
}
