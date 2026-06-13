import { describe, expect, it } from 'vitest';
import { applyMove, canMove, deal, findHint, golfRules, isWon } from './golf';
import type { PileRef } from './types';

const WASTE: PileRef = { kind: 'waste', index: 0 };

describe('golf', () => {
  it('deals 7 columns of 5 face-up cards, one waste card, 16 stock', () => {
    const s = deal(42);
    expect(s.tableau.map((p) => p.length)).toEqual([5, 5, 5, 5, 5, 5, 5]);
    expect(s.tableau.flat().every((c) => c.faceUp)).toBe(true);
    expect(s.waste).toHaveLength(1);
    expect(s.stock).toHaveLength(16);
    expect(JSON.stringify(deal(9))).toBe(JSON.stringify(deal(9)));
  });

  it('plays only rank-adjacent cards onto the waste (no wrap)', () => {
    const s = deal(1);
    s.waste = [{ id: 'X', suit: 'S', rank: 7, faceUp: true }];
    s.tableau[0]![4]!.rank = 8;
    s.tableau[1]![4]!.rank = 6;
    s.tableau[2]![4]!.rank = 7;
    expect(canMove(s, { kind: 'tableau', index: 0 }, WASTE, 1)).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 1 }, WASTE, 1)).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 2 }, WASTE, 1)).toBe(false);
    // ace does not wrap onto a king
    s.waste[0]!.rank = 13;
    s.tableau[0]![4]!.rank = 1;
    expect(canMove(s, { kind: 'tableau', index: 0 }, WASTE, 1)).toBe(false);
  });

  it('draw flips one stock card; move clears a tableau card and scores', () => {
    const s = deal(1);
    applyMove(s, { type: 'draw' });
    expect(s.waste).toHaveLength(2);
    s.waste[s.waste.length - 1]!.rank = 5;
    s.tableau[3]![4]!.rank = 4;
    applyMove(s, { type: 'move', from: { kind: 'tableau', index: 3 }, to: WASTE, count: 1 });
    expect(s.tableau[3]).toHaveLength(4);
    expect(s.score).toBe(5);
  });

  it('wins when every column is empty', () => {
    const s = deal(1);
    expect(isWon(s)).toBe(false);
    s.tableau.forEach((p) => p.splice(0));
    expect(isWon(s)).toBe(true);
  });

  it('hint plays a card when possible, draws otherwise, null when dead', () => {
    const s = deal(1);
    s.waste = [{ id: 'X', suit: 'S', rank: 5, faceUp: true }];
    s.tableau.forEach((p) => p.forEach((c) => (c.rank = 9)));
    expect(findHint(s)).toEqual({ type: 'draw' });
    s.tableau[2]![4]!.rank = 4;
    expect(findHint(s)).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 2 },
      to: WASTE,
      count: 1,
    });
    s.tableau[2]![4]!.rank = 9;
    s.stock = [];
    expect(findHint(s)).toBeNull();
  });

  it('exposes a complete ruleset for the shared controller', () => {
    expect(golfRules.wasteDrop).toBe(true);
    expect(golfRules.foundationCount).toBe(0);
    expect(golfRules.isTriviallyWinnable(deal(1))).toBe(false);
  });
});
