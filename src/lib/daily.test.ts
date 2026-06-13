// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bestDailyStreak,
  currentDailyStreak,
  dailyNumber,
  dailySeed,
  formatCountdown,
  loadDaily,
  msUntilNextDaily,
  recordDailyWin,
  utcDateKey,
} from './daily';

const at = (iso: string) => new Date(iso);

beforeEach(() => localStorage.clear());

describe('daily seed and numbering', () => {
  it('derives the seed from the UTC date', () => {
    expect(dailySeed(at('2026-06-13T00:00:01Z'))).toBe(20260613);
    expect(dailySeed(at('2026-06-13T23:59:59Z'))).toBe(20260613);
    expect(dailySeed(at('2026-06-14T00:00:01Z'))).toBe(20260614);
  });

  it('is identical across timezones (UTC-based)', () => {
    // 18:00 in Los Angeles on the 13th is already the 14th in Tokyo —
    // both clients compute from the same UTC instant.
    const instant = at('2026-06-14T01:00:00Z');
    expect(dailySeed(instant)).toBe(20260614);
  });

  it('numbers days from the epoch', () => {
    expect(dailyNumber(at('2026-06-13T12:00:00Z'))).toBe(1);
    expect(dailyNumber(at('2026-06-20T12:00:00Z'))).toBe(8);
  });

  it('counts down to the next UTC midnight', () => {
    const ms = msUntilNextDaily(at('2026-06-13T21:30:00Z'));
    expect(ms).toBe(2.5 * 3600 * 1000);
    expect(formatCountdown(ms)).toBe('2h 30m');
    expect(formatCountdown(59_000)).toBe('1m');
  });
});

describe('daily history', () => {
  it('records the first win and keeps the faster of repeat wins', () => {
    recordDailyWin('2026-06-13', { timeMs: 200_000, moves: 120, score: 500 });
    recordDailyWin('2026-06-13', { timeMs: 500_000, moves: 90, score: 700 });
    expect(loadDaily().days['2026-06-13']!.timeMs).toBe(200_000);
    recordDailyWin('2026-06-13', { timeMs: 150_000, moves: 80, score: 800 });
    expect(loadDaily().days['2026-06-13']!.timeMs).toBe(150_000);
  });

  it('computes the current streak ending today', () => {
    const r = { timeMs: 1, moves: 1, score: 1 };
    recordDailyWin('2026-06-11', r);
    recordDailyWin('2026-06-12', r);
    recordDailyWin('2026-06-13', r);
    expect(currentDailyStreak(loadDaily(), at('2026-06-13T15:00:00Z'))).toBe(3);
  });

  it("keeps yesterday's streak alive while today is unsolved", () => {
    const r = { timeMs: 1, moves: 1, score: 1 };
    recordDailyWin('2026-06-11', r);
    recordDailyWin('2026-06-12', r);
    expect(currentDailyStreak(loadDaily(), at('2026-06-13T15:00:00Z'))).toBe(2);
  });

  it('a missed day resets the streak', () => {
    const r = { timeMs: 1, moves: 1, score: 1 };
    recordDailyWin('2026-06-10', r);
    recordDailyWin('2026-06-11', r);
    expect(currentDailyStreak(loadDaily(), at('2026-06-13T15:00:00Z'))).toBe(0);
  });

  it('tracks the best historical streak across gaps', () => {
    const r = { timeMs: 1, moves: 1, score: 1 };
    for (const d of ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-05', '2026-06-06']) {
      recordDailyWin(d, r);
    }
    expect(bestDailyStreak(loadDaily())).toBe(3);
  });

  it('handles month boundaries in streaks', () => {
    const r = { timeMs: 1, moves: 1, score: 1 };
    recordDailyWin('2026-05-31', r);
    recordDailyWin('2026-06-01', r);
    expect(currentDailyStreak(loadDaily(), at('2026-06-01T12:00:00Z'))).toBe(2);
  });
});

describe('utcDateKey', () => {
  it('formats as YYYY-MM-DD in UTC', () => {
    expect(utcDateKey(at('2026-06-13T23:59:59Z'))).toBe('2026-06-13');
  });
});

describe('daily rotation', () => {
  it('cycles deterministically and stays within the rotation', async () => {
    const { dailyGame, DAILY_ROTATION, dailyNumber } = await import('./daily');
    const day1 = dailyGame(at('2026-06-13T12:00:00Z'));
    expect(day1).toBe(DAILY_ROTATION[0]);
    // wraps after the rotation length
    const wrap = dailyGame(at('2026-06-27T12:00:00Z')); // day 15 → index 0
    expect(dailyNumber(at('2026-06-27T12:00:00Z'))).toBe(15);
    expect(wrap).toBe(DAILY_ROTATION[0]);
    const day2 = dailyGame(at('2026-06-14T12:00:00Z'));
    expect(day2).toBe(DAILY_ROTATION[1]);
  });

  it('includes every game in the catalogue', async () => {
    const { DAILY_ROTATION } = await import('./daily');
    const games = new Set(DAILY_ROTATION.map((e) => e.game));
    for (const g of [
      'klondike', 'spider', 'freecell', 'pyramid', 'tripeaks',
      'golf', 'sudoku', 'mahjong', 'minesweeper', '2048',
    ]) {
      expect(games.has(g)).toBe(true);
    }
  });

  it('every rotation entry has a label and a path', async () => {
    const { DAILY_ROTATION } = await import('./daily');
    for (const e of DAILY_ROTATION) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.path.startsWith('/')).toBe(true);
    }
  });

  it('records the game name with a solve and shows it in history', async () => {
    const { recordDailyWin, loadDaily } = await import('./daily');
    recordDailyWin('2026-06-13', { timeMs: 1000, moves: 10, score: 5, game: 'Sudoku' });
    expect(loadDaily().days['2026-06-13']!.game).toBe('Sudoku');
  });
});
