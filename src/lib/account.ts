import { SITE_CONFIG } from './site-config';
import { GAMES } from '../games/registry';
import {
  type Stats,
  type VariantStats,
  emptyVariantStats,
  loadStats,
  saveStats,
} from './stats';
import { type DailyRecord, loadDaily, replaceDaily } from './daily';
import { earnedBadgeIds, loadUnlocked, saveUnlocked } from './achievements';
import {
  type Settings,
  loadSettings,
  loadSettingsUpdatedAt,
  applyRemoteSettings,
} from './settings';

/**
 * Optional accounts. By default the whole site is guest/local — this module
 * just reports "not signed in". When SITE_CONFIG.accounts is enabled (Supabase
 * URL + anon key set, and Google OAuth configured on the project), it adds
 * real Google sign-in and cross-device sync that *merges* progress so a player
 * never loses streaks or badges when they log in from a new device.
 *
 * The Supabase calls are plain fetch against the public REST/auth endpoints —
 * no SDK dependency — and only ever run when accounts are enabled. Cloud rows
 * are protected by row-level security (see supabase/schema.sql).
 */

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

export interface PlayerData {
  /** game id → Stats. */
  stats: Record<string, Stats>;
  daily: DailyRecord;
  badges: string[];
  /** Display preferences (theme, table surface, cards, tiles, …). */
  settings?: Settings;
  /** When `settings` last changed on the writing device (epoch ms). */
  settingsUpdatedAt?: number;
  updatedAt: number;
}

const GAME_IDS = GAMES.map((g) => g.id).filter((id) => id !== 'daily');
const TOKEN_KEY = 'solitude.account.token';
const USER_KEY = 'solitude.account.user';
const REFRESH_KEY = 'solitude.account.refresh';

export function accountsEnabled(): boolean {
  const a = SITE_CONFIG.accounts;
  return a.enabled && !!a.supabaseUrl && !!a.supabaseAnonKey;
}

// ----- local data collection ---------------------------------------------

export function collectLocalData(): PlayerData {
  const stats: Record<string, Stats> = {};
  for (const game of GAME_IDS) stats[game] = loadStats(game);
  return {
    stats,
    daily: loadDaily(),
    badges: [...loadUnlocked()],
    settings: loadSettings(),
    settingsUpdatedAt: loadSettingsUpdatedAt(),
    updatedAt: Date.now(),
  };
}

export function applyLocalData(data: PlayerData): void {
  for (const game of GAME_IDS) {
    if (data.stats[game]) saveStats(game, data.stats[game]!);
  }
  if (data.daily) replaceDaily(data.daily);
  if (data.badges) saveUnlocked(new Set(data.badges));
  if (data.settings) applyRemoteSettings(data.settings, data.settingsUpdatedAt ?? Date.now());
}

// ----- pure merge (never lose progress) -----------------------------------

function mergeVariant(a: VariantStats, b: VariantStats): VariantStats {
  return {
    gamesPlayed: Math.max(a.gamesPlayed, b.gamesPlayed),
    gamesWon: Math.max(a.gamesWon, b.gamesWon),
    currentStreak: Math.max(a.currentStreak, b.currentStreak),
    bestStreak: Math.max(a.bestStreak, b.bestStreak),
    totalMoves: Math.max(a.totalMoves, b.totalMoves),
    bestScore: Math.max(a.bestScore, b.bestScore),
    bestTimeMs:
      a.bestTimeMs === null ? b.bestTimeMs
      : b.bestTimeMs === null ? a.bestTimeMs
      : Math.min(a.bestTimeMs, b.bestTimeMs),
  };
}

function mergeStats(a: Stats, b: Stats): Stats {
  const variants: Record<string, VariantStats> = {};
  const keys = new Set([...Object.keys(a.variants), ...Object.keys(b.variants)]);
  for (const k of keys) {
    variants[k] = mergeVariant(
      a.variants[k] ?? emptyVariantStats(),
      b.variants[k] ?? emptyVariantStats(),
    );
  }
  return { variants };
}

function mergeDaily(a: DailyRecord, b: DailyRecord): DailyRecord {
  const days = { ...a.days };
  for (const [day, res] of Object.entries(b.days)) {
    const existing = days[day];
    // keep the faster solve for any day solved on either device
    if (!existing || res.timeMs < existing.timeMs) days[day] = res;
  }
  return { days };
}

/** Combine two snapshots so the result is the best of both — symmetric. */
export function mergePlayerData(a: PlayerData, b: PlayerData): PlayerData {
  const stats: Record<string, Stats> = {};
  for (const game of GAME_IDS) {
    stats[game] = mergeStats(
      a.stats[game] ?? { variants: {} },
      b.stats[game] ?? { variants: {} },
    );
  }
  // Settings aren't "best of both" — they're a single current choice, so the
  // most recently changed side wins (last-write-wins by change-time).
  const aTs = a.settingsUpdatedAt ?? 0;
  const bTs = b.settingsUpdatedAt ?? 0;
  let settings = a.settings;
  let settingsUpdatedAt = aTs;
  if (b.settings && (bTs > aTs || !a.settings)) {
    settings = b.settings;
    settingsUpdatedAt = bTs;
  }

  return {
    stats,
    daily: mergeDaily(a.daily, b.daily),
    badges: [...new Set([...a.badges, ...b.badges])],
    settings,
    settingsUpdatedAt,
    updatedAt: Date.now(),
  };
}

// ----- session / user -----------------------------------------------------

export function getCachedUser(): AccountUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AccountUser) : null;
  } catch {
    return null;
  }
}

function setSession(token: string | null, user: AccountUser | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // storage unavailable
  }
}

function token(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function headers(authToken: string): Record<string, string> {
  return {
    apikey: SITE_CONFIG.accounts.supabaseAnonKey,
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };
}

function loadRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

/** Exchange the stored refresh token for a fresh access token (Supabase). */
async function refreshSession(): Promise<string | null> {
  const rt = loadRefresh();
  if (!rt) return null;
  try {
    const res = await fetch(
      `${SITE_CONFIG.accounts.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          apikey: SITE_CONFIG.accounts.supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: rt }),
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (!j.access_token) return null;
    try {
      localStorage.setItem(TOKEN_KEY, j.access_token);
      if (j.refresh_token) localStorage.setItem(REFRESH_KEY, j.refresh_token);
    } catch {
      /* ignore */
    }
    return j.access_token;
  } catch {
    return null;
  }
}

/**
 * Authenticated request to the Supabase REST/data API. If the access token has
 * expired (401), refresh it once and retry — so a session survives well beyond
 * the ~1-hour access-token lifetime.
 */
async function cloudFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const current = token();
  if (!current) return null;
  const build = (tok: string): RequestInit => ({
    ...init,
    headers: { ...headers(tok), ...((init.headers as Record<string, string>) ?? {}) },
  });
  let res = await fetch(`${SITE_CONFIG.accounts.supabaseUrl}${path}`, build(current));
  if (res.status === 401) {
    const fresh = await refreshSession();
    if (fresh) res = await fetch(`${SITE_CONFIG.accounts.supabaseUrl}${path}`, build(fresh));
  }
  return res;
}

/** Begin Google sign-in by redirecting to Supabase's OAuth endpoint. */
export function signInWithGoogle(): void {
  if (!accountsEnabled()) return;
  const redirect = encodeURIComponent(window.location.href.split('#')[0]!);
  window.location.href =
    `${SITE_CONFIG.accounts.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${redirect}`;
}

export async function signOut(): Promise<void> {
  const t = token();
  if (t && accountsEnabled()) {
    try {
      await fetch(`${SITE_CONFIG.accounts.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: headers(t),
      });
    } catch {
      // best effort
    }
  }
  setSession(null, null);
  try {
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
  emit(null);
}

async function fetchUser(authToken: string): Promise<AccountUser | null> {
  try {
    const res = await fetch(`${SITE_CONFIG.accounts.supabaseUrl}/auth/v1/user`, {
      headers: headers(authToken),
    });
    if (!res.ok) return null;
    const u = (await res.json()) as {
      id: string;
      email?: string;
      user_metadata?: { full_name?: string; name?: string; avatar_url?: string };
    };
    return {
      id: u.id,
      email: u.email ?? '',
      name: u.user_metadata?.full_name || u.user_metadata?.name || (u.email ?? 'Player'),
      picture: u.user_metadata?.avatar_url,
    };
  } catch {
    return null;
  }
}

async function fetchCloudData(uid: string): Promise<PlayerData | null> {
  try {
    const res = await cloudFetch(`/rest/v1/profiles?id=eq.${uid}&select=data`);
    if (!res || !res.ok) return null;
    const rows = (await res.json()) as { data: PlayerData }[];
    return rows[0]?.data ?? null;
  } catch {
    return null;
  }
}

async function pushCloudData(uid: string, data: PlayerData): Promise<void> {
  try {
    await cloudFetch('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: uid, data, updated_at: new Date().toISOString() }),
    });
  } catch {
    // best effort; local data is the source of truth meanwhile
  }
}

/** Merge cloud ↔ local both directions so neither side loses progress. */
async function sync(uid: string): Promise<void> {
  const local = collectLocalData();
  const cloud = await fetchCloudData(uid);
  const merged = cloud ? mergePlayerData(local, cloud) : local;
  const settingsBefore = JSON.stringify(local.settings);
  applyLocalData(merged);
  // re-evaluate badges against the merged stats so earned set is consistent
  saveUnlocked(new Set([...merged.badges, ...earnedBadgeIds()]));
  // Let pages (e.g. the Daily hero) re-render now that cloud data is applied.
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('cardhearth:synced'));
    } catch {
      /* ignore */
    }
  }
  await pushCloudData(uid, merged);
  // If the cloud brought different display settings, reload once so already
  // rendered cards/tiles pick them up (theme and surface update live, but card
  // and tile art needs a fresh render).
  maybeReloadForSettings(settingsBefore, JSON.stringify(merged.settings));
}

/** Reload a single time when synced-down settings differ from this device's. */
function maybeReloadForSettings(before: string, after: string): void {
  if (typeof window === 'undefined' || before === after) return;
  try {
    if (sessionStorage.getItem('cardhearth.settings.synced')) return;
    sessionStorage.setItem('cardhearth.settings.synced', '1');
    location.reload();
  } catch {
    /* ignore */
  }
}

// ----- lifecycle ----------------------------------------------------------

type Listener = (user: AccountUser | null) => void;
const listeners = new Set<Listener>();

export function onAccountChange(fn: Listener): void {
  listeners.add(fn);
}

function emit(user: AccountUser | null): void {
  for (const fn of listeners) fn(user);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardhearth:account', { detail: user }));
  }
}

/**
 * Run on every page load: capture an OAuth redirect, restore a session, and
 * sync. No-op (guest) when accounts are disabled.
 */
export async function initAccount(): Promise<void> {
  if (!accountsEnabled() || typeof window === 'undefined') return;
  // Supabase returns the session in the URL hash after the Google redirect.
  if (window.location.hash.includes('access_token=')) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (access) {
      const user = await fetchUser(access);
      if (user) {
        setSession(access, user);
        if (refresh) {
          try {
            localStorage.setItem(REFRESH_KEY, refresh);
          } catch {
            /* ignore */
          }
        }
        history.replaceState(null, '', window.location.pathname + window.location.search);
        emit(user);
        await sync(user.id);
        return;
      }
    }
  }
  const t = token();
  const cached = getCachedUser();
  if (t && cached) {
    emit(cached);
    await sync(cached.id);
  }
}

/** Push local progress to the cloud after a game (debounced by callers). */
export async function syncUp(): Promise<void> {
  const t = token();
  const user = getCachedUser();
  if (!accountsEnabled() || !t || !user) return;
  await pushCloudData(user.id, collectLocalData());
}
