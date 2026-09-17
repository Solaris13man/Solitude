import { describe, expect, it } from 'vitest';
import { GAMES, gameById, recommendedGame } from './registry';

describe('recommendedGame', () => {
  it('never recommends a game to itself', () => {
    for (const g of GAMES) {
      expect(recommendedGame(g.id)?.id).not.toBe(g.id);
    }
  });

  it('only ever points at a game that exists in the catalogue', () => {
    for (const g of GAMES) {
      const next = recommendedGame(g.id);
      if (next) expect(gameById(next.id)).toBeDefined();
    }
  });

  it('covers every playable game', () => {
    // The Daily Challenge is a hub, not a game — it needs no recommendation.
    const playable = GAMES.filter((g) => g.id !== 'daily');
    const uncovered = playable.filter((g) => !recommendedGame(g.id)).map((g) => g.id);
    expect(uncovered).toEqual([]);
  });

  it('pairs the trick-taking games with each other, not with solitaire', () => {
    expect(recommendedGame('spades')?.id).toBe('hearts');
    expect(recommendedGame('hearts')?.id).toBe('spades');
  });

  it('returns undefined for the daily hub and for unknown ids', () => {
    expect(recommendedGame('daily')).toBeUndefined();
    expect(recommendedGame('not-a-game')).toBeUndefined();
  });
});
