import { SITE_CONFIG } from './site-config';
import { isDailySolved, utcDateKey } from './daily';
import { loadSettings, saveSettings } from './settings';

/**
 * Opt-in daily-reminder web push (off by default). The browser subscribes via
 * the service worker and the subscription is stored in Supabase; a scheduled
 * edge function sends one gentle reminder per day at the user's chosen local
 * hour. Everything here no-ops unless SITE_CONFIG.push.enabled is true.
 *
 * The "enabled" state is device-specific (a push subscription belongs to one
 * browser), so it lives in local storage. The preferred hour is a synced
 * Settings value, so it follows a signed-in player across devices.
 */

const ENABLED_KEY = 'cardhearth.push.enabled.v1';
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

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function setEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, '1');
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
}

/** Preferred reminder hour — a synced Settings value (defaults to 19). */
function getHour(): number {
  const h = loadSettings().reminderHour;
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 19;
}

function setHour(hour: number): void {
  saveSettings({ ...loadSettings(), reminderHour: hour });
}

export function loadPref(): ReminderPref {
  return { enabled: loadEnabled(), hour: getHour() };
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

/** Last failure detail (human-readable), surfaced in the UI for debugging. */
let lastError = '';
export function lastPushError(): string {
  return lastError;
}

/** Turn the reminder on: request permission, subscribe, and store it. */
export async function enableReminder(hour: number): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  lastError = '';
  if (!pushSupported() || !pushConfigured()) {
    lastError = 'push not supported or not configured on this device';
    return 'unsupported';
  }
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  let sub: PushSubscription;
  try {
    const reg = await getRegistration();
    if (!reg) {
      lastError = 'no service worker registration';
      return 'error';
    }
    sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(SITE_CONFIG.push.vapidPublicKey),
      }));
  } catch (err) {
    lastError = 'subscribe failed: ' + ((err as Error)?.message || String(err));
    return 'error';
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    // Writes go through a SECURITY DEFINER RPC scoped to this endpoint —
    // direct table INSERT/UPDATE is revoked (see the hardening migration).
    const body = {
      _endpoint: sub.endpoint,
      _p256dh: keyToBase64(sub.getKey('p256dh')),
      _auth: keyToBase64(sub.getKey('auth')),
      _tz: tz,
      _hour: hour,
    };
    const res = await fetch(`${SITE_CONFIG.accounts.supabaseUrl}/rest/v1/rpc/upsert_push_subscription`, {
      method: 'POST',
      headers: restHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      lastError = `save failed (HTTP ${res.status}) ${detail.slice(0, 140)}`.trim();
      return 'error';
    }
  } catch (err) {
    lastError = 'network error saving subscription: ' + ((err as Error)?.message || String(err));
    return 'error';
  }
  setHour(hour); // synced preference
  setEnabled(true); // device-local
  return 'ok';
}

/** Update the reminder hour (synced); re-upsert this device's subscription if on. */
export async function updateReminderHour(hour: number): Promise<void> {
  setHour(hour);
  if (loadEnabled()) await enableReminder(hour); // re-upsert with the new hour
}

/** Turn the reminder off: unsubscribe and remove the stored subscription. */
export async function disableReminder(): Promise<void> {
  setEnabled(false);
  try {
    const reg = await getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch(`${SITE_CONFIG.accounts.supabaseUrl}/rest/v1/rpc/delete_push_subscription`, {
        method: 'POST',
        headers: restHeaders(),
        body: JSON.stringify({ _endpoint: endpoint }),
      });
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
