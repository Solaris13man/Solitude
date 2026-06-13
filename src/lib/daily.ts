/**
 * Daily Challenge: one shared deal per UTC day. The seed derives from the
 * date (YYYYMMDD), so every player worldwide gets identical cards, and
 * completion/streak history is tracked locally per day.
 */

export interface DailyResult {
  timeMs: number;
  moves: number;
  score: number;
}

export interface DailyRecord {
  /** Keyed by UTC date, e.g. "2026-06-13". Presence means solved. */
  days: Record<string, DailyResult>;
}

const KEY = 'solitude.daily.v1.klondike';

/** Daily #1. */
export const DAILY_EPOCH_UTC = Date.UTC(2026, 5, 13);

const DAY_MS = 86_400_000;

export function utcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Everyone's seed for the given UTC day: the integer YYYYMMDD. */
export function dailySeed(date = new Date()): number {
  return (
    date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate()
  );
}

export function dailyNumber(date = new Date()): number {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - DAILY_EPOCH_UTC) / DAY_MS) + 1;
}

export function msUntilNextDaily(date = new Date()): number {
  const next =
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + DAY_MS;
  return next - date.getTime();
}

export function formatCountdown(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function loadDaily(): DailyRecord {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { days: {} };
    const parsed = JSON.parse(raw) as Partial<DailyRecord>;
    return { days: { ...(parsed.days ?? {}) } };
  } catch {
    return { days: {} };
  }
}

/** Records the first solve of a day; later solves of the same day are kept
 *  only if faster. Returns the updated record. */
export function recordDailyWin(dateKey: string, result: DailyResult): DailyRecord {
  const record = loadDaily();
  const existing = record.days[dateKey];
  if (!existing || result.timeMs < existing.timeMs) {
    record.days[dateKey] = result;
    try {
      localStorage.setItem(KEY, JSON.stringify(record));
    } catch {
      // storage unavailable
    }
  }
  return record;
}

function previousDateKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return utcDateKey(new Date(d.getTime() - DAY_MS));
}

/**
 * Streak of consecutive solved days ending today — or ending yesterday if
 * today isn't solved yet (the streak is still alive until UTC midnight).
 */
export function currentDailyStreak(record: DailyRecord, date = new Date()): number {
  let key = utcDateKey(date);
  if (!record.days[key]) {
    key = previousDateKey(key);
    if (!record.days[key]) return 0;
  }
  let streak = 0;
  while (record.days[key]) {
    streak++;
    key = previousDateKey(key);
  }
  return streak;
}

export function bestDailyStreak(record: DailyRecord): number {
  const keys = Object.keys(record.days).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of keys) {
    run = prev !== null && previousDateKey(key) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

export function totalDailySolves(record: DailyRecord): number {
  return Object.keys(record.days).length;
}
