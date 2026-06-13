/**
 * Daily Challenge: one shared puzzle per UTC day, rotating across the whole
 * catalogue. The day's game and its deal seed both derive from the date, so
 * every player worldwide gets the identical challenge, and completion/streak
 * history is tracked locally per day.
 */

export interface DailyResult {
  timeMs: number;
  moves: number;
  score: number;
  /** Which game this day's challenge was (for the history display). */
  game?: string;
}

export interface DailyRecord {
  /** Keyed by UTC date, e.g. "2026-06-13". Presence means solved. */
  days: Record<string, DailyResult>;
}

/** One day's challenge: a game, its variant, where it lives, and a label. */
export interface DailyEntry {
  game: string;
  variant: number;
  label: string;
  path: string;
  /** 2048 has no "win", so its daily is solved by reaching this tile. */
  target?: number;
}

/**
 * The rotation. Every game appears; `dailyNumber % length` picks the day, so
 * the schedule is deterministic and shared by everyone. Day 1 is Klondike.
 */
export const DAILY_ROTATION: DailyEntry[] = [
  { game: 'klondike', variant: 1, label: 'Klondike (Draw 1)', path: '/klondike/' },
  { game: 'sudoku', variant: 2, label: 'Sudoku (Medium)', path: '/sudoku/' },
  { game: 'spider', variant: 1, label: 'Spider (1 Suit)', path: '/spider/' },
  { game: 'mahjong', variant: 1, label: 'Mahjong (Turtle)', path: '/mahjong/' },
  { game: 'freecell', variant: 0, label: 'FreeCell', path: '/freecell/' },
  { game: 'minesweeper', variant: 2, label: 'Minesweeper (Medium)', path: '/minesweeper/' },
  { game: 'tripeaks', variant: 0, label: 'TriPeaks', path: '/tripeaks/' },
  { game: '2048', variant: 0, label: '2048 (reach 512)', path: '/2048/', target: 512 },
  { game: 'klondike', variant: 3, label: 'Klondike (Draw 3)', path: '/klondike/' },
  { game: 'pyramid', variant: 0, label: 'Pyramid', path: '/pyramid/' },
  { game: 'sudoku', variant: 3, label: 'Sudoku (Hard)', path: '/sudoku/' },
  { game: 'golf', variant: 0, label: 'Golf', path: '/golf/' },
  { game: 'spider', variant: 2, label: 'Spider (2 Suits)', path: '/spider/' },
  { game: 'mahjong', variant: 7, label: 'Mahjong (Diamond)', path: '/mahjong/' },
];

const KEY = 'solitude.daily.v1.klondike';

/** Daily #1. */
export const DAILY_EPOCH_UTC = Date.UTC(2026, 5, 13);

const DAY_MS = 86_400_000;

export function utcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Today's challenge from the rotation. */
export function dailyGame(date = new Date()): DailyEntry {
  const idx = (dailyNumber(date) - 1) % DAILY_ROTATION.length;
  return DAILY_ROTATION[((idx % DAILY_ROTATION.length) + DAILY_ROTATION.length) % DAILY_ROTATION.length]!;
}

/** True when the current page was opened as today's daily (?daily=1). */
export function isDailyRequest(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('daily') === '1';
  } catch {
    return false;
  }
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

/** Overwrite the whole daily record (used by account sync). */
export function replaceDaily(record: DailyRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // storage unavailable
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardhearth:result'));
  }
  return record;
}

/** Has today's daily already been solved? */
export function isDailySolved(date = new Date()): boolean {
  return !!loadDaily().days[utcDateKey(date)];
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
