/**
 * Daily Challenge: one shared puzzle per UTC day. The day's game and its deal
 * seed both derive from the date, so every player worldwide gets the identical
 * challenge, and completion/streak history is tracked locally per day.
 *
 * Streak rule: the streak counts DAYS YOU SHOWED UP, not days you won. Making
 * a single move on the day's challenge keeps it alive; solving is still
 * tracked, still shown, and still what the leaderboard, the solve count and
 * the Perfect Year badge are made of. Missing a day need not end a run
 * either — see the streak-freeze ledger below.
 *
 * Fairness rule: because the daily is shared and carries a streak, every deal
 * MUST be completable — an unsolvable shared deal would break everyone's streak
 * through no fault of their own. So the rotation is limited to games where every
 * deal is guaranteed (or, for FreeCell, all-but-certainly) solvable:
 *   - Sudoku   — generated and verified logic-solvable, no guessing.
 *   - Mahjong  — built in reverse so a winning path always exists.
 *   - FreeCell — solvable for all but a vanishing fraction of deals (~1 in 1000s).
 *   - 2048     — a skill target (reach a tile), not a deal that can be "unsolvable".
 * The random-deal solitaires (Klondike, Spider, Yukon, Scorpion, Pyramid,
 * TriPeaks, Golf, Forty Thieves, Eight Off) and Minesweeper (which can require
 * guessing) are deliberately NOT in the daily — they remain fully playable on
 * their own pages. The computer card games (Hearts, Spades, Euchre, Gin) are
 * not in it either.
 */

import { track } from './analytics';

export interface DailyResult {
  timeMs: number;
  moves: number;
  score: number;
  /** Which game this day's challenge was (for the history display). */
  game?: string;
}

/** A day the player showed up for but did not necessarily finish. */
export interface DailyPlay {
  /** Which game that day's challenge was (for the history display). */
  game?: string;
}

/**
 * Streak-freeze ledger. A freeze is earned for every `FREEZE_EARN_EVERY` days
 * of an unbroken run, banked up to `MAX_STREAK_FREEZES`, and spent
 * automatically when the player comes back from a short absence.
 *
 * Spending is *recorded*, not recomputed — `spent` marks the days a freeze
 * covered, so re-deriving the streak later walks straight over them instead
 * of charging for the same gap again.
 */
export interface DailyFreezes {
  /** Freezes in hand, 0..MAX_STREAK_FREEZES. */
  banked: number;
  /**
   * Days that have already granted a freeze.
   *
   * A ledger rather than a counter, because a player can fill in ARCHIVE days
   * in any order: back-filling a gap lengthens runs retroactively, which mints
   * threshold days that a forward-only counter would miss. Recomputing the
   * threshold set on every touch and granting only for days not in this ledger
   * makes the result order-independent and self-healing, while still making
   * spending a real decrement that refills only as new thresholds are crossed.
   */
  earnedOn: Record<string, true>;
  /** UTC days a freeze was spent on. Presence makes the day count as kept. */
  spent: Record<string, true>;
}

export interface DailyRecord {
  /**
   * Keyed by UTC date, e.g. "2026-06-13". Presence means SOLVED.
   *
   * Do not widen this to mean "played". The leaderboard, the solve count, the
   * Perfect Year badge, the calendar's solve marks and DailyMode's
   * re-solve guard all read it as "finished it", and participation lives in
   * `played` precisely so none of them have to change.
   */
  days: Record<string, DailyResult>;
  /** Keyed by UTC date. Presence means PLAYED — at least one real move. */
  played: Record<string, DailyPlay>;
  freezes: DailyFreezes;
}

/** Days of unbroken streak that earn one freeze. */
export const FREEZE_EARN_EVERY = 7;
/** Most freezes that can be banked at once — also the longest bridgeable gap. */
export const MAX_STREAK_FREEZES = 3;

export function emptyDaily(): DailyRecord {
  return { days: {}, played: {}, freezes: { banked: 0, earnedOn: {}, spent: {} } };
}

/**
 * Coerce anything record-shaped into a complete DailyRecord.
 *
 * Records written before freezes existed have only `days`, and a record
 * arriving from cloud sync can be any vintage — so every read goes through
 * here rather than trusting the stored shape.
 */
export function normalizeDaily(raw: Partial<DailyRecord> | null | undefined): DailyRecord {
  const f = raw?.freezes;
  return {
    days: { ...(raw?.days ?? {}) },
    played: { ...(raw?.played ?? {}) },
    freezes: {
      // Clamped on the way in: a corrupt or hand-edited bank cannot hand out
      // more protection than the cap allows.
      banked: Math.max(0, Math.min(MAX_STREAK_FREEZES, Math.trunc(Number(f?.banked) || 0))),
      earnedOn: { ...(f?.earnedOn ?? {}) },
      spent: { ...(f?.spent ?? {}) },
    },
  };
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
 * The rotation — only guaranteed-solvable games (see the fairness rule above).
 * `dailyNumber % length` picks the day, so the schedule is deterministic and
 * shared by everyone. Variety comes from the four Sudoku difficulties, the
 * Mahjong layouts, FreeCell, and the two 2048 targets. Day 1 is Sudoku (Medium).
 */
export const DAILY_ROTATION: DailyEntry[] = [
  { game: 'sudoku', variant: 2, label: 'Sudoku (Medium)', path: '/sudoku/' },
  { game: 'mahjong', variant: 1, label: 'Mahjong (Turtle)', path: '/mahjong/' },
  { game: 'freecell', variant: 0, label: 'FreeCell', path: '/freecell/' },
  { game: '2048', variant: 0, label: '2048 (reach 512)', path: '/2048/', target: 512 },
  { game: 'sudoku', variant: 3, label: 'Sudoku (Hard)', path: '/sudoku/' },
  { game: 'mahjong', variant: 7, label: 'Mahjong (Diamond)', path: '/mahjong/' },
  { game: 'sudoku', variant: 1, label: 'Sudoku (Easy)', path: '/sudoku/' },
  { game: 'mahjong', variant: 2, label: 'Mahjong (Cross)', path: '/mahjong/' },
  { game: 'freecell', variant: 0, label: 'FreeCell', path: '/freecell/' },
  { game: 'sudoku', variant: 4, label: 'Sudoku (Expert)', path: '/sudoku/' },
  { game: 'mahjong', variant: 4, label: 'Mahjong (Fortress)', path: '/mahjong/' },
  { game: '2048', variant: 0, label: '2048 (reach 1024)', path: '/2048/', target: 1024 },
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
    if (!raw) return emptyDaily();
    return normalizeDaily(JSON.parse(raw) as Partial<DailyRecord>);
  } catch {
    return emptyDaily();
  }
}

function saveDaily(record: DailyRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // storage unavailable (private mode); the session still works
  }
}

function announceResult(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardhearth:result'));
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
  bridgeGapWithFreezes(record, dateKey);
  const existing = record.days[dateKey];
  if (!existing || result.timeMs < existing.timeMs) {
    record.days[dateKey] = result;
  }
  // Solving implies showing up, so the day counts for the streak even if the
  // player's very first interaction was the winning move.
  record.played[dateKey] ??= { game: result.game };
  earnFreezes(record);
  saveDaily(record);
  announceResult();
  return record;
}

/**
 * Records that the player showed up for a day's challenge — one real move is
 * enough. This is what keeps a streak alive; solving is a separate, stricter
 * record (`days`) that the leaderboard and the Perfect Year badge read.
 *
 * Idempotent: repeat calls for the same day are a no-op, so a rerender or a
 * second move can never inflate anything.
 */
export function recordDailyPlay(dateKey: string, game?: string): DailyRecord {
  const record = loadDaily();
  if (record.played[dateKey]) return record;
  bridgeGapWithFreezes(record, dateKey);
  record.played[dateKey] = game === undefined ? {} : { game };
  earnFreezes(record);
  saveDaily(record);
  announceResult();
  return record;
}

/** Has today's daily already been solved? */
export function isDailySolved(date = new Date()): boolean {
  return !!loadDaily().days[utcDateKey(date)];
}

/** Has the player made at least one move on this day's challenge? */
export function isDailyPlayed(date = new Date()): boolean {
  const key = utcDateKey(date);
  const record = loadDaily();
  return !!record.played[key] || !!record.days[key];
}

function previousDateKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return utcDateKey(new Date(d.getTime() - DAY_MS));
}

/** What a given day contributes to the streak, for display and for the walk. */
export type DailyDayState = 'solved' | 'played' | 'frozen' | 'missed';

export function dailyDayState(record: DailyRecord, key: string): DailyDayState {
  if (record.days[key]) return 'solved';
  if (record.played[key]) return 'played';
  if (record.freezes.spent[key]) return 'frozen';
  return 'missed';
}

/** True when a day counts toward an unbroken run — played, solved, or frozen. */
function isKept(record: DailyRecord, key: string): boolean {
  return dailyDayState(record, key) !== 'missed';
}

/**
 * Streak of consecutive kept days ending today — or ending yesterday if today
 * hasn't been touched yet (the streak is still alive until UTC midnight).
 *
 * "Kept" means played, solved, or covered by a spent freeze.
 */
export function currentDailyStreak(record: DailyRecord, date = new Date()): number {
  let key = utcDateKey(date);
  if (!isKept(record, key)) {
    key = previousDateKey(key);
    if (!isKept(record, key)) return 0;
  }
  let streak = 0;
  while (isKept(record, key)) {
    streak++;
    key = previousDateKey(key);
  }
  return streak;
}

/** Every day that counts toward a run, oldest first. */
function keptKeys(record: DailyRecord): string[] {
  return [
    ...new Set([
      ...Object.keys(record.days),
      ...Object.keys(record.played),
      ...Object.keys(record.freezes.spent),
    ]),
  ].sort();
}

export function bestDailyStreak(record: DailyRecord): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of keptKeys(record)) {
    run = prev !== null && previousDateKey(key) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

/** Freezes the player has in hand right now. */
export function bankedFreezes(record: DailyRecord): number {
  return record.freezes.banked;
}

/**
 * Spend banked freezes to cover a short absence, immediately before `dateKey`
 * is recorded as kept.
 *
 * Only ever called for a day the player is actively touching, and only bridges
 * a gap it can pay for in full — a half-covered gap would break the run
 * anyway, so the freezes are better kept in the bank.
 */
function bridgeGapWithFreezes(record: DailyRecord, dateKey: string): void {
  if (record.freezes.banked <= 0) return;
  if (isKept(record, dateKey)) return; // already counted; nothing to bridge

  // The bank, bounded by the longest gap we are willing to bridge at all.
  const reach = Math.min(record.freezes.banked, MAX_STREAK_FREEZES);
  const gap: string[] = [];
  let key = previousDateKey(dateKey);

  // Walk back looking for the end of the previous run. Note the anchor day sits
  // one step BEYOND the last day we could pay for, so this examines reach + 1
  // days while only ever collecting reach of them.
  for (;;) {
    if (isKept(record, key)) {
      for (const missed of gap) record.freezes.spent[missed] = true;
      record.freezes.banked -= gap.length;
      if (gap.length > 0) {
        track('daily_streak_frozen', {
          days_covered: gap.length,
          freezes_left: record.freezes.banked,
        });
      }
      return;
    }
    // Nothing kept within reach: the gap is wider than the bank can pay for.
    // Bridging it halfway would break the run anyway, so keep the freezes.
    if (gap.length >= reach) return;
    gap.push(key);
    key = previousDateKey(key);
  }
}

/** Length of the unbroken run of kept days ending exactly at `key`. */
function runLengthEndingAt(record: DailyRecord, key: string): number {
  let len = 0;
  let k = key;
  while (isKept(record, k)) {
    len++;
    k = previousDateKey(k);
  }
  return len;
}

/**
 * Grant a freeze for every day that completes a multiple of FREEZE_EARN_EVERY,
 * skipping days already in the ledger.
 *
 * Recomputed across the whole history rather than incrementally, so filling in
 * archive days out of order still awards what the player has actually earned.
 */
function earnFreezes(record: DailyRecord): void {
  const f = record.freezes;
  if (f.banked >= MAX_STREAK_FREEZES) {
    // Still record the thresholds, or they would all pay out at once the
    // moment a freeze is spent.
    for (const key of keptKeys(record)) {
      if (runLengthEndingAt(record, key) % FREEZE_EARN_EVERY === 0) f.earnedOn[key] = true;
    }
    return;
  }
  for (const key of keptKeys(record)) {
    if (f.earnedOn[key]) continue;
    if (runLengthEndingAt(record, key) % FREEZE_EARN_EVERY !== 0) continue;
    f.earnedOn[key] = true;
    if (f.banked < MAX_STREAK_FREEZES) {
      f.banked++;
      track('daily_freeze_earned', { streak: runLengthEndingAt(record, key), freezes: f.banked });
    }
  }
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
