// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { BADGES, checkForNewBadges, earnedBadgeIds, loadUnlocked, snapshot } from './achievements';
import { recordResult } from './stats';
import { recordDailyWin, utcDateKey } from './daily';

beforeEach(() => localStorage.clear());

describe('achievements', () => {
  it('starts with nothing earned', () => {
    expect(earnedBadgeIds(snapshot()).size).toBe(0);
  });

  it('unlocks First Win after one win', () => {
    recordResult({ game: 'klondike', variant: 1, won: true, elapsedMs: 1000, moves: 10, score: 5 });
    expect(earnedBadgeIds(snapshot()).has('first-win')).toBe(true);
  });

  it('unlocks variant-specific badges', () => {
    recordResult({ game: 'spider', variant: 4, won: true, elapsedMs: 1000, moves: 10, score: 5 });
    recordResult({ game: 'minesweeper', variant: 3, won: true, elapsedMs: 1000, moves: 10, score: 0 });
    recordResult({ game: 'sudoku', variant: 4, won: true, elapsedMs: 1000, moves: 10, score: 0 });
    const earned = earnedBadgeIds(snapshot());
    expect(earned.has('spider-slayer')).toBe(true);
    expect(earned.has('bomb-squad')).toBe(true);
    expect(earned.has('logician')).toBe(true);
  });

  it('unlocks daily streak badges from the daily record', () => {
    const r = { timeMs: 1000, moves: 1, score: 1, game: 'Klondike' };
    recordDailyWin('2026-06-11', r);
    recordDailyWin('2026-06-12', r);
    recordDailyWin('2026-06-13', r);
    expect(earnedBadgeIds(snapshot()).has('daily-3')).toBe(true);
    void utcDateKey();
  });

  it('checkForNewBadges returns only freshly unlocked badges, then nothing', () => {
    recordResult({ game: 'klondike', variant: 1, won: true, elapsedMs: 1000, moves: 10, score: 5 });
    const fresh = checkForNewBadges();
    expect(fresh.map((b) => b.id)).toContain('first-win');
    expect(loadUnlocked().has('first-win')).toBe(true);
    // second call: already celebrated → nothing new
    expect(checkForNewBadges()).toHaveLength(0);
  });

  it('every badge has a unique id and an icon', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BADGES) expect(b.icon.length).toBeGreaterThan(0);
  });
});
