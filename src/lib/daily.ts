/**
 * Daily Challenge: one shared puzzle per UTC day, rotating across the solitaire
 * and puzzle games (the computer card games — Hearts, Spades, Euchre, Gin — are
 * not in it). The day's game and its deal seed both derive from the date, so
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
 * The rotation. Every solo game appears; `dailyNumber % length` picks the day, so
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
  { game: 'yukon', variant: 0, label: 'Yukon', path: '/yukon/' },
  { game: 'freecell', variant: 0, label: 'FreeCell', path: '/freecell/' },
  { game: 'scorpion', variant: 0, label: 'Scorpion', path: '/scorpion/' },
  { game: 'eightoff', variant: 0, label: 'Eight Off', path: '/eight-off/' },
  { game: 'fortythieves', variant: 0, label: 'Forty Thieves', path: '/forty-thieves/' },
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

/**
 * The daily the current page was opened for, from `?daily=`:
 *   ?daily=1 (or `today`)  → today's challenge
 *   ?daily=YYYY-MM-DD      → that day's archived challenge
 * Returns null when there's no daily request, or when the date is invalid,
 * in the future, or before the Daily Challenge launched (no challenge existed).
 */
export function requestedDailyDate(): Date | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('daily');
    if (!raw) return null;
    if (raw === '1' || raw === 'today') return new Date();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const d = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    if (raw > utcDateKey()) return null; // future dates can't be played
    const dayUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (dayUTC < DAILY_EPOCH_UTC) return null; // before the daily existed
    return d;
  } catch {
    return null;
  }
}

/** True when the current page was opened as a daily (today or an archive). */
export function isDailyRequest(): boolean {
  return requestedDailyDate() !== null;
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

/** First and last UTC midnight (ms) for which a daily existed in `year`,
 *  bounded by the launch epoch and by `today` (no future days). Returns null
 *  if the year has no playable daily days yet. */
export function dailyYearRange(
  year: number,
  today = new Date(),
): { start: number; end: number } | null {
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const start = Math.max(Date.UTC(year, 0, 1), DAILY_EPOCH_UTC);
  const end = Math.min(Date.UTC(year, 11, 31), todayUTC);
  if (end < start) return null;
  return { start, end };
}

/** How many dailies have existed (so far) in `year`, and how many are solved. */
export function dailyYearProgress(
  record: DailyRecord,
  year: number,
  today = new Date(),
): { solved: number; available: number } {
  const range = dailyYearRange(year, today);
  if (!range) return { solved: 0, available: 0 };
  let available = 0;
  let solved = 0;
  for (let t = range.start; t <= range.end; t += DAY_MS) {
    available++;
    if (record.days[utcDateKey(new Date(t))]) solved++;
  }
  return { solved, available };
}

/**
 * True once every daily of some fully-elapsed calendar year has been solved.
 * A year only counts when it's entirely in the past (its Dec 31 is before
 * today), and "every daily" means every day from the launch epoch (or Jan 1)
 * through Dec 31 of that year.
 */
export function hasCompletedDailyYear(record: DailyRecord, today = new Date()): boolean {
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const startYear = new Date(DAILY_EPOCH_UTC).getUTCFullYear();
  for (let year = startYear; year <= today.getUTCFullYear(); year++) {
    if (Date.UTC(year, 11, 31) >= todayUTC) continue; // year not fully elapsed
    const range = dailyYearRange(year, today);
    if (!range) continue;
    let complete = true;
    for (let t = range.start; t <= range.end; t += DAY_MS) {
      if (!record.days[utcDateKey(new Date(t))]) {
        complete = false;
        break;
      }
    }
    if (complete) return true;
  }
  return false;
}
