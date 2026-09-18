// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FREEZE_EARN_EVERY,
  MAX_STREAK_FREEZES,
  bankedFreezes,
  bestDailyStreak,
  currentDailyStreak,
  dailyDayState,
  emptyDaily,
  isDailyPlayed,
  isDailySolved,
  loadDaily,
  normalizeDaily,
  recordDailyPlay,
  recordDailyWin,
} from './daily';

const at = (iso: string) => new Date(iso);
const DAY = 86_400_000;
/** UTC date key `n` days before `from`. */
function key(from: string, n = 0): string {
  return new Date(new Date(`${from}T00:00:00Z`).getTime() - n * DAY).toISOString().slice(0, 10);
}
const solve = (k: string) => recordDailyWin(k, { timeMs: 1000, moves: 5, score: 1, game: 'freecell' });

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('participation keeps the streak', () => {
  it('counts a played-but-unsolved day', () => {
    const today = '2026-09-18';
    recordDailyPlay(key(today, 1), 'sudoku');
    recordDailyPlay(key(today, 0), 'freecell');
    expect(currentDailyStreak(loadDaily(), at(`${today}T12:00:00Z`))).toBe(2);
  });

  it('keeps playing and solving separable', () => {
    const today = '2026-09-18';
    recordDailyPlay(key(today), 'freecell');
    expect(isDailyPlayed(at(`${today}T12:00:00Z`))).toBe(true);
    expect(isDailySolved(at(`${today}T12:00:00Z`))).toBe(false);
    // The leaderboard and the Perfect Year badge read `days`, which must stay
    // empty until the puzzle is actually finished.
    expect(Object.keys(loadDaily().days)).toEqual([]);
  });

  it('marks a day solved as well as played when it is won', () => {
    const today = '2026-09-18';
    solve(key(today));
    const rec = loadDaily();
    expect(dailyDayState(rec, key(today))).toBe('solved');
    expect(rec.played[key(today)]).toBeDefined();
  });

  it('is idempotent — replaying a day cannot inflate anything', () => {
    const k = key('2026-09-18');
    recordDailyPlay(k, 'freecell');
    recordDailyPlay(k, 'freecell');
    recordDailyPlay(k, 'freecell');
    expect(Object.keys(loadDaily().played)).toEqual([k]);
  });

  it('still ends a run when a day is genuinely skipped with no freezes', () => {
    const today = '2026-09-18';
    recordDailyPlay(key(today, 3), 'a');
    recordDailyPlay(key(today, 0), 'b'); // 2-day hole, bank empty
    expect(currentDailyStreak(loadDaily(), at(`${today}T12:00:00Z`))).toBe(1);
  });

  it('stays alive until UTC midnight on an untouched day', () => {
    const today = '2026-09-18';
    recordDailyPlay(key(today, 1), 'a');
    // Today not played yet — yesterday still carries the run.
    expect(currentDailyStreak(loadDaily(), at(`${today}T23:00:00Z`))).toBe(1);
  });
});

describe('earning freezes', () => {
  it(`grants one every ${FREEZE_EARN_EVERY} days`, () => {
    const today = '2026-09-18';
    for (let i = FREEZE_EARN_EVERY - 1; i >= 0; i--) recordDailyPlay(key(today, i), 'g');
    expect(bankedFreezes(loadDaily())).toBe(1);
  });

  it('grants nothing before the first threshold', () => {
    const today = '2026-09-18';
    for (let i = FREEZE_EARN_EVERY - 2; i >= 0; i--) recordDailyPlay(key(today, i), 'g');
    expect(bankedFreezes(loadDaily())).toBe(0);
  });

  it(`never banks more than ${MAX_STREAK_FREEZES}`, () => {
    const today = '2026-09-18';
    for (let i = FREEZE_EARN_EVERY * (MAX_STREAK_FREEZES + 3); i >= 0; i--) {
      recordDailyPlay(key(today, i), 'g');
    }
    expect(bankedFreezes(loadDaily())).toBe(MAX_STREAK_FREEZES);
  });

  it('does not grant twice for the same threshold', () => {
    const today = '2026-09-18';
    for (let i = FREEZE_EARN_EVERY; i >= 0; i--) recordDailyPlay(key(today, i), 'g');
    // 8 consecutive days = one threshold crossed, not two.
    expect(bankedFreezes(loadDaily())).toBe(1);
  });

  it('lets a rebuilt run earn its freezes again', () => {
    const today = '2026-09-18';
    // A long-ago run that earned one, then a gap far too wide to bridge.
    for (let i = FREEZE_EARN_EVERY - 1; i >= 0; i--) recordDailyPlay(key(today, 40 + i), 'g');
    expect(bankedFreezes(loadDaily())).toBe(1);
    for (let i = FREEZE_EARN_EVERY - 1; i >= 0; i--) recordDailyPlay(key(today, i), 'g');
    expect(bankedFreezes(loadDaily())).toBe(2);
  });

  it('awards back-filled archive days regardless of the order they arrive', () => {
    const today = '2026-09-18';
    // Play the ends first, then fill the middle — the completed run is only
    // FREEZE_EARN_EVERY long once the last hole is plugged.
    const order = [0, 6, 2, 4, 1, 5, 3];
    for (const i of order) recordDailyPlay(key(today, i), 'g');
    expect(currentDailyStreak(loadDaily(), at(`${today}T12:00:00Z`))).toBe(FREEZE_EARN_EVERY);
    expect(bankedFreezes(loadDaily())).toBe(1);
  });
});

describe('spending freezes', () => {
  /** Build a run of `days` consecutive played days ending `endAgo` days back. */
  function run(today: string, days: number, endAgo: number) {
    for (let i = days - 1 + endAgo; i >= endAgo; i--) recordDailyPlay(key(today, i), 'g');
  }

  it('bridges a one-day absence and marks the day frozen', () => {
    const today = '2026-09-18';
    run(today, FREEZE_EARN_EVERY, 2); // earns 1, ends two days ago
    expect(bankedFreezes(loadDaily())).toBe(1);
    recordDailyPlay(key(today, 0), 'g'); // returns after missing yesterday
    const rec = loadDaily();
    expect(dailyDayState(rec, key(today, 1))).toBe('frozen');
    expect(currentDailyStreak(rec, at(`${today}T12:00:00Z`))).toBe(FREEZE_EARN_EVERY + 2);
    expect(bankedFreezes(rec)).toBe(0);
  });

  it('bridges a multi-day absence when the bank can pay in full', () => {
    const today = '2026-09-18';
    run(today, FREEZE_EARN_EVERY * MAX_STREAK_FREEZES, 3); // full bank, ends 3 days ago
    expect(bankedFreezes(loadDaily())).toBe(MAX_STREAK_FREEZES);
    recordDailyPlay(key(today, 0), 'g'); // missed 2 days
    const rec = loadDaily();
    expect(dailyDayState(rec, key(today, 1))).toBe('frozen');
    expect(dailyDayState(rec, key(today, 2))).toBe('frozen');
    expect(bankedFreezes(rec)).toBe(MAX_STREAK_FREEZES - 2);
  });

  it('refuses a gap it can only half cover, and keeps the freezes', () => {
    const today = '2026-09-18';
    run(today, FREEZE_EARN_EVERY, 4); // exactly 1 freeze, run ends 4 days back
    expect(bankedFreezes(loadDaily())).toBe(1);
    recordDailyPlay(key(today, 0), 'g'); // 3-day hole, only 1 freeze
    const rec = loadDaily();
    expect(dailyDayState(rec, key(today, 1))).toBe('missed');
    expect(currentDailyStreak(rec, at(`${today}T12:00:00Z`))).toBe(1); // run ended
    expect(bankedFreezes(rec)).toBe(1); // unspent, still in hand
  });

  it(`never bridges more than ${MAX_STREAK_FREEZES} days even with a full bank`, () => {
    const today = '2026-09-18';
    run(today, FREEZE_EARN_EVERY * MAX_STREAK_FREEZES, MAX_STREAK_FREEZES + 2);
    recordDailyPlay(key(today, 0), 'g');
    expect(currentDailyStreak(loadDaily(), at(`${today}T12:00:00Z`))).toBe(1);
  });

  it('does not re-charge for a gap it already bridged', () => {
    const today = '2026-09-18';
    run(today, FREEZE_EARN_EVERY * 2, 2); // 2 freezes, ends two days ago
    recordDailyPlay(key(today, 0), 'g');
    const after = bankedFreezes(loadDaily());
    // Solving the same day later must not spend a second freeze.
    solve(key(today, 0));
    expect(bankedFreezes(loadDaily())).toBe(after);
  });

  it('spends nothing when the player never missed a day', () => {
    const today = '2026-09-18';
    run(today, FREEZE_EARN_EVERY, 1);
    const before = bankedFreezes(loadDaily());
    recordDailyPlay(key(today, 0), 'g');
    expect(bankedFreezes(loadDaily())).toBe(before);
  });
});

describe('best streak', () => {
  it('counts played, solved and frozen days alike', () => {
    const today = '2026-09-18';
    recordDailyPlay(key(today, 5), 'a');
    solve(key(today, 4));
    recordDailyPlay(key(today, 3), 'c');
    expect(bestDailyStreak(loadDaily())).toBe(3);
  });
});

describe('migration from solve-only records', () => {
  it('fills in the new fields without touching existing solves', () => {
    const legacy = { days: { '2026-06-13': { timeMs: 1, moves: 1, score: 0 } } };
    const rec = normalizeDaily(legacy);
    expect(rec.days['2026-06-13']).toEqual({ timeMs: 1, moves: 1, score: 0 });
    expect(rec.played).toEqual({});
    expect(rec.freezes).toEqual({ banked: 0, earnedOn: {}, spent: {} });
  });

  it('computes an existing solve streak exactly as before', () => {
    const today = '2026-09-18';
    const days: Record<string, { timeMs: number; moves: number; score: number }> = {};
    for (let i = 0; i < 5; i++) days[key(today, i)] = { timeMs: 1, moves: 1, score: 0 };
    const rec = normalizeDaily({ days });
    expect(currentDailyStreak(rec, at(`${today}T12:00:00Z`))).toBe(5);
  });

  it('cannot resurrect a dead streak, because the bank starts empty', () => {
    // A long solve history that ended weeks ago must stay ended.
    const today = '2026-09-18';
    const days: Record<string, { timeMs: number; moves: number; score: number }> = {};
    for (let i = 30; i < 60; i++) days[key(today, i)] = { timeMs: 1, moves: 1, score: 0 };
    const rec = normalizeDaily({ days });
    expect(bankedFreezes(rec)).toBe(0);
    expect(currentDailyStreak(rec, at(`${today}T12:00:00Z`))).toBe(0);
  });

  it('pays a legacy player their earned freezes once, then stops', () => {
    // A record from before freezes existed has no earn ledger, so the first
    // touch reconciles the whole history. That is deliberate — the streak was
    // genuinely earned — but it must happen exactly once, not on every move.
    const today = '2026-09-18';
    const days: Record<string, { timeMs: number; moves: number; score: number }> = {};
    for (let i = 1; i <= FREEZE_EARN_EVERY * 2; i++) {
      days[key(today, i)] = { timeMs: 1, moves: 1, score: 0 };
    }
    localStorage.setItem('solitude.daily.v1.klondike', JSON.stringify({ days }));
    expect(bankedFreezes(loadDaily())).toBe(0); // nothing granted just by reading

    recordDailyPlay(key(today, 0), 'g');
    const first = bankedFreezes(loadDaily());
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(MAX_STREAK_FREEZES);

    solve(key(today, 0));
    expect(bankedFreezes(loadDaily())).toBe(first); // no second payout
  });

  it('clamps a corrupt or hand-edited bank to the cap', () => {
    const rec = normalizeDaily({
      days: {},
      played: {},
      freezes: { banked: 9999, earnedOn: {}, spent: {} },
    });
    expect(rec.freezes.banked).toBe(MAX_STREAK_FREEZES);
  });

  it('survives a record with garbage in the freeze slot', () => {
    const rec = normalizeDaily({ freezes: 'nonsense' } as never);
    expect(rec.freezes).toEqual({ banked: 0, earnedOn: {}, spent: {} });
    expect(() => currentDailyStreak(rec)).not.toThrow();
  });
});

describe('emptyDaily', () => {
  it('is a complete, inert record', () => {
    const rec = emptyDaily();
    expect(currentDailyStreak(rec)).toBe(0);
    expect(bestDailyStreak(rec)).toBe(0);
    expect(bankedFreezes(rec)).toBe(0);
  });
});
