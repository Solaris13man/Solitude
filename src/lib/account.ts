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
  updatedAt: number;
}

const GAME_IDS = GAMES.map((g) => g.id).filter((id) => id !== 'daily');
const TOKEN_KEY = 'solitude.account.token';
const USER_KEY = 'solitude.account.user';

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
    updatedAt: Date.now(),
  };
}

export function applyLocalData(data: PlayerData): void {
  for (const game of GAME_IDS) {
    if (data.stats[game]) saveStats(game, data.stats[game]!);
  }
  if (data.daily) replaceDaily(data.daily);
  if (data.badges) saveUnlocked(new Set(data.badges));
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
  return {
    stats,
    daily: mergeDaily(a.daily, b.daily),
    badges: [...new Set([...a.badges, ...b.badges])],
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

async function fetchCloudData(authToken: string, uid: string): Promise<PlayerData | null> {
  try {
    const res = await fetch(
      `${SITE_CONFIG.accounts.supabaseUrl}/rest/v1/profiles?id=eq.${uid}&select=data`,
      { headers: headers(authToken) },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { data: PlayerData }[];
    return rows[0]?.data ?? null;
  } catch {
    return null;
  }
}

async function pushCloudData(authToken: string, uid: string, data: PlayerData): Promise<void> {
  try {
    await fetch(`${SITE_CONFIG.accounts.supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...headers(authToken), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: uid, data, updated_at: new Date().toISOString() }),
    });
  } catch {
    // best effort; local data is the source of truth meanwhile
  }
}

/** Merge cloud ↔ local both directions so neither side loses progress. */
async function sync(authToken: string, uid: string): Promise<void> {
  const local = collectLocalData();
  const cloud = await fetchCloudData(authToken, uid);
  const merged = cloud ? mergePlayerData(local, cloud) : local;
  applyLocalData(merged);
  // re-evaluate badges against the merged stats so earned set is consistent
  saveUnlocked(new Set([...merged.badges, ...earnedBadgeIds()]));
  await pushCloudData(authToken, uid, merged);
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
    if (access) {
      const user = await fetchUser(access);
      if (user) {
        setSession(access, user);
        history.replaceState(null, '', window.location.pathname + window.location.search);
        emit(user);
        await sync(access, user.id);
        return;
      }
    }
  }
  const t = token();
  const cached = getCachedUser();
  if (t && cached) {
    emit(cached);
    await sync(t, cached.id);
  }
}

/** Push local progress to the cloud after a game (debounced by callers). */
export async function syncUp(): Promise<void> {
  const t = token();
  const user = getCachedUser();
  if (!accountsEnabled() || !t || !user) return;
  await pushCloudData(t, user.id, collectLocalData());
}
