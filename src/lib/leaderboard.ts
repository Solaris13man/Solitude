import { SITE_CONFIG } from './site-config';
import { dailyGame, loadDaily } from './daily';
import { cloudFetch, getCachedUser } from './account';

/**
 * Daily Challenge leaderboard. Because the daily is one deterministic puzzle
 * per UTC day (the same deal for everyone), solve times are directly
 * comparable. Signed-in players submit their best result for a day; the board
 * is publicly readable. Reads use the public anon key; writes go through the
 * account module's authenticated fetch so row-level security can check that a
 * row belongs to the writer. Everything no-ops gracefully when accounts aren't
 * configured or the player isn't signed in.
 */

export interface LeaderRow {
  name: string;
  timeMs: number;
  moves: number;
  /** True for the signed-in player's own row, so the UI can highlight it. */
  me: boolean;
}

function enabled(): boolean {
  const a = SITE_CONFIG.accounts;
  return a.enabled && !!a.supabaseUrl && !!a.supabaseAnonKey;
}

const anonHeaders = () => ({
  apikey: SITE_CONFIG.accounts.supabaseAnonKey,
  'Content-Type': 'application/json',
});

/** First name only (keeps the public board light on personal info). */
function displayName(full: string): string {
  const first = (full || 'Player').trim().split(/\s+/)[0] || 'Player';
  return first.slice(0, 24);
}

/**
 * Submit the signed-in player's recorded result for `day` (a UTC date key).
 * Uses the locally stored best for that day, upserting so re-solving keeps one
 * row per player per day. Silently does nothing for guests.
 */
export async function submitDailyScore(day: string): Promise<void> {
  if (!enabled()) return;
  const user = getCachedUser();
  if (!user) return; // only signed-in players appear on the board
  const rec = loadDaily().days[day];
  if (!rec) return;
  const game = rec.game ?? dailyGame(new Date(`${day}T00:00:00Z`)).game;
  const body = {
    user_id: user.id,
    day,
    game,
    time_ms: rec.timeMs,
    moves: rec.moves,
    score: rec.score,
    name: displayName(user.name),
  };
  try {
    await cloudFetch('/rest/v1/daily_scores?on_conflict=user_id,day', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(body),
    });
  } catch {
    // best effort — the local solve and streak are unaffected
  }
}

/** The fastest `limit` results for a day, ascending by time. Public read. */
export async function fetchDailyLeaderboard(
  day: string,
  limit = 20,
): Promise<LeaderRow[] | null> {
  if (!enabled()) return null;
  try {
    const res = await fetch(
      `${SITE_CONFIG.accounts.supabaseUrl}/rest/v1/daily_scores` +
        `?day=eq.${day}&select=name,time_ms,moves,user_id&order=time_ms.asc&limit=${limit}`,
      { headers: anonHeaders() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as {
      name: string;
      time_ms: number;
      moves: number;
      user_id: string;
    }[];
    const me = getCachedUser()?.id;
    return rows.map((r) => ({
      name: r.name || 'Player',
      timeMs: r.time_ms,
      moves: r.moves,
      me: !!me && r.user_id === me,
    }));
  } catch {
    return null;
  }
}
