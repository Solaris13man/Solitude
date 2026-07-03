// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { mergePlayerData, collectLocalData, applyLocalData, type PlayerData } from './account';
import { recordResult } from './stats';

beforeEach(() => localStorage.clear());

function pd(over: Partial<PlayerData>): PlayerData {
  return { stats: {}, daily: { days: {} }, badges: [], updatedAt: 0, ...over };
}

describe('account merge (never lose progress)', () => {
  it('takes the best of each variant stat from both devices', () => {
    const a = pd({
      stats: {
        klondike: {
          variants: {
            v1: { gamesPlayed: 10, gamesWon: 4, currentStreak: 1, bestStreak: 3, totalMoves: 100, bestScore: 500, bestTimeMs: 200000 },
          },
        },
      },
    });
    const b = pd({
      stats: {
        klondike: {
          variants: {
            v1: { gamesPlayed: 5, gamesWon: 2, currentStreak: 2, bestStreak: 5, totalMoves: 60, bestScore: 800, bestTimeMs: 150000 },
          },
        },
      },
    });
    const m = mergePlayerData(a, b).stats.klondike!.variants.v1!;
    expect(m.gamesPlayed).toBe(10);
    expect(m.gamesWon).toBe(4);
    expect(m.bestStreak).toBe(5);
    expect(m.bestScore).toBe(800);
    expect(m.bestTimeMs).toBe(150000); // faster time wins
  });

  it('unions badges and keeps the faster daily solve per day', () => {
    const a = pd({
      badges: ['first-win', 'win-10'],
      daily: { days: { '2026-06-13': { timeMs: 300000, moves: 5, score: 1 } } },
    });
    const b = pd({
      badges: ['win-10', 'streak-5'],
      daily: { days: { '2026-06-13': { timeMs: 200000, moves: 9, score: 2 }, '2026-06-14': { timeMs: 100000, moves: 3, score: 3 } } },
    });
    const m = mergePlayerData(a, b);
    expect(new Set(m.badges)).toEqual(new Set(['first-win', 'win-10', 'streak-5']));
    expect(m.daily.days['2026-06-13']!.timeMs).toBe(200000);
    expect(m.daily.days['2026-06-14']!.timeMs).toBe(100000);
  });

  it('does not resurrect a reset win-streak from the other device', () => {
    // Device A just LOST (streak reset to 0, one more game played). Device B
    // holds the stale pre-loss state. The loss must survive the merge — the
    // old Math.max merge would bring the dead streak back on every sync.
    const afterLoss = { gamesPlayed: 11, gamesWon: 4, currentStreak: 0, bestStreak: 4, totalMoves: 110, bestScore: 500, bestTimeMs: 200000 };
    const stale = { gamesPlayed: 10, gamesWon: 4, currentStreak: 4, bestStreak: 4, totalMoves: 100, bestScore: 500, bestTimeMs: 200000 };
    const a = pd({ stats: { klondike: { variants: { v1: { ...afterLoss } } } } });
    const b = pd({ stats: { klondike: { variants: { v1: { ...stale } } } } });
    expect(mergePlayerData(a, b).stats.klondike!.variants.v1!.currentStreak).toBe(0);
    expect(mergePlayerData(b, a).stats.klondike!.variants.v1!.currentStreak).toBe(0);
  });

  it('ignores a legacy 0ms "best time" when merging', () => {
    const withZero = { gamesPlayed: 5, gamesWon: 2, currentStreak: 1, bestStreak: 2, totalMoves: 50, bestScore: 0, bestTimeMs: 0 };
    const real = { gamesPlayed: 5, gamesWon: 2, currentStreak: 1, bestStreak: 2, totalMoves: 50, bestScore: 0, bestTimeMs: 90000 };
    const a = pd({ stats: { hearts: { variants: { v0: { ...withZero } } } } });
    const b = pd({ stats: { hearts: { variants: { v0: { ...real } } } } });
    expect(mergePlayerData(a, b).stats.hearts!.variants.v0!.bestTimeMs).toBe(90000);
  });

  it('is symmetric for the fields that matter', () => {
    const a = pd({ badges: ['a'], stats: { sudoku: { variants: { v3: { ...zero(), gamesWon: 2 } } } } });
    const b = pd({ badges: ['b'], stats: { sudoku: { variants: { v3: { ...zero(), gamesWon: 5 } } } } });
    const ab = mergePlayerData(a, b).stats.sudoku!.variants.v3!.gamesWon;
    const ba = mergePlayerData(b, a).stats.sudoku!.variants.v3!.gamesWon;
    expect(ab).toBe(5);
    expect(ba).toBe(5);
  });

  it('round-trips local data through collect/apply', () => {
    recordResult({ game: 'klondike', variant: 1, won: true, elapsedMs: 90000, moves: 80, score: 600 });
    const data = collectLocalData();
    localStorage.clear();
    applyLocalData(data);
    const restored = collectLocalData();
    expect(restored.stats.klondike!.variants.v1!.gamesWon).toBe(1);
  });
});

function zero() {
  return { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, bestStreak: 0, totalMoves: 0, bestScore: 0, bestTimeMs: null };
}
