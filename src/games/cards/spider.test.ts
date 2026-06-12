import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './deck';
import type { GameState } from './types';
import {
  applyMove,
  canDraw,
  canMove,
  canPickRun,
  deal,
  findHint,
  isWon,
  autoMoveFor,
} from './spider';

let nextId = 0;
function card(suit: Suit, rank: number, faceUp = true): Card {
  return { id: `${suit}${rank}-t${nextId++}`, suit, rank: rank as Rank, faceUp };
}

function emptyState(): GameState {
  return {
    game: 'spider',
    seed: 0,
    variant: 1,
    stock: [],
    waste: [],
    cells: [],
    foundations: [[], [], [], [], [], [], [], []],
    tableau: Array.from({ length: 10 }, () => []),
    moves: 0,
    score: 500,
    recycles: 0,
  };
}

describe('spider deal', () => {
  it('deals 6/6/6/6/5… with 50 in the stock', () => {
    const s = deal(42, 1);
    expect(s.tableau.map((p) => p.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
    expect(s.stock).toHaveLength(50);
    for (const pile of s.tableau) {
      pile.forEach((c, i) => expect(c.faceUp).toBe(i === pile.length - 1));
    }
  });

  it('builds the right suit mix per variant', () => {
    expect(new Set(deal(1, 1).stock.map((c) => c.suit)).size).toBe(1);
    const two = deal(1, 2);
    expect(new Set([...two.stock, ...two.tableau.flat()].map((c) => c.suit))).toEqual(
      new Set(['S', 'H']),
    );
    const four = deal(1, 4);
    expect(new Set([...four.stock, ...four.tableau.flat()].map((c) => c.suit)).size).toBe(4);
  });

  it('is deterministic per seed', () => {
    expect(JSON.stringify(deal(9, 2))).toBe(JSON.stringify(deal(9, 2)));
  });
});

describe('spider runs and moves', () => {
  it('only same-suit descending runs are pickable', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 9), card('S', 8), card('S', 7)];
    s.tableau[1] = [card('S', 9), card('H', 8)];
    expect(canPickRun(s, { kind: 'tableau', index: 0 }, 2)).toBe(true);
    expect(canPickRun(s, { kind: 'tableau', index: 1 }, 1)).toBe(false);
    expect(canPickRun(s, { kind: 'tableau', index: 1 }, 0)).toBe(true);
  });

  it('any suit may land on a rank+1 card', () => {
    const s = emptyState();
    s.tableau[0] = [card('H', 8)];
    s.tableau[1] = [card('S', 9)];
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 1)).toBe(true);
  });

  it('any run may move to an empty pile', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 5), card('S', 4)];
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 2)).toBe(true);
  });

  it('moving exposes and flips the card underneath', () => {
    const s = emptyState();
    s.tableau[0] = [card('D', 3, false), card('S', 5)];
    s.tableau[1] = [card('H', 6)];
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 1,
    });
    expect(s.tableau[0]![0]!.faceUp).toBe(true);
  });

  it('dealing requires every pile to be occupied', () => {
    const s = emptyState();
    s.stock = Array.from({ length: 10 }, (_, i) => card('S', ((i % 13) + 1) as number, false));
    s.tableau.forEach((p, i) => p.push(card('S', ((i % 13) + 1) as number)));
    expect(canDraw(s)).toBe(true);
    s.tableau[3] = [];
    expect(canDraw(s)).toBe(false);
  });

  it('a deal adds one face-up card to each pile', () => {
    const s = deal(3, 1);
    applyMove(s, { type: 'draw' });
    expect(s.stock).toHaveLength(40);
    expect(s.tableau.map((p) => p.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6, 6, 6]);
    for (const pile of s.tableau) expect(pile[pile.length - 1]!.faceUp).toBe(true);
  });
});

describe('spider run completion', () => {
  function pileWithRun(suit: Suit, extra?: Card): Card[] {
    const pile: Card[] = extra ? [extra] : [];
    for (let r = 13; r >= 2; r--) pile.push(card(suit, r));
    return pile;
  }

  it('sweeps a completed K→A run to a foundation and flips beneath', () => {
    const s = emptyState();
    s.tableau[0] = pileWithRun('S', card('H', 7, false));
    s.tableau[1] = [card('S', 1)];
    const before = s.score;
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 1 },
      to: { kind: 'tableau', index: 0 },
      count: 1,
    });
    expect(s.foundations.filter((f) => f.length === 13)).toHaveLength(1);
    expect(s.foundations.find((f) => f.length === 13)![12]!.rank).toBe(13);
    expect(s.tableau[0]).toHaveLength(1);
    expect(s.tableau[0]![0]!.faceUp).toBe(true);
    expect(s.score).toBe(before + 100 - 1);
  });

  it('does not sweep a sequence finished with the wrong suit', () => {
    const s = emptyState();
    s.tableau[0] = pileWithRun('S'); // K..2 of spades
    s.tableau[1] = [card('H', 1)];
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 1 },
      to: { kind: 'tableau', index: 0 },
      count: 1,
    });
    expect(s.foundations.every((f) => f.length === 0)).toBe(true);
  });

  it('eight completed runs win the game', () => {
    const s = emptyState();
    for (let i = 0; i < 8; i++) {
      s.foundations[i] = Array.from({ length: 13 }, (_, r) => card('S', 13 - r));
    }
    expect(isWon(s)).toBe(true);
  });
});

describe('spider tap and hints', () => {
  it('tap prefers a same-suit continuation', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 8)];
    s.tableau[1] = [card('H', 9)];
    s.tableau[2] = [card('S', 9)];
    const move = autoMoveFor(s, { kind: 'tableau', index: 0 }, 0);
    expect(move).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 2 },
      count: 1,
    });
  });

  it('hint prefers a same-suit join over an off-suit one', () => {
    const s = emptyState();
    s.tableau[0] = [card('D', 4, false), card('S', 8)];
    s.tableau[1] = [card('H', 9)];
    s.tableau[2] = [card('S', 9)];
    s.stock = [card('S', 2, false)];
    const hint = findHint(s);
    expect(hint).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 2 },
      count: 1,
    });
  });

  it('hint falls back to dealing', () => {
    const s = emptyState();
    s.tableau.forEach((p) => p.push(card('S', 5)));
    s.stock = Array.from({ length: 10 }, () => card('S', 9, false));
    expect(findHint(s)).toEqual({ type: 'draw' });
  });
});
