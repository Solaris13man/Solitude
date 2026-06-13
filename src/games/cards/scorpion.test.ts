import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './deck';
import type { GameState } from './types';
import {
  applyMove,
  autoMoveFor,
  canDraw,
  canMove,
  canPickRun,
  deal,
  findHint,
  isWon,
} from './scorpion';

let nextId = 0;
function card(suit: Suit, rank: number, faceUp = true): Card {
  return { id: `${suit}${rank}-t${nextId++}`, suit, rank: rank as Rank, faceUp };
}

function emptyState(): GameState {
  return {
    game: 'scorpion',
    seed: 0,
    variant: 0,
    stock: [],
    waste: [],
    cells: [],
    foundations: [[], [], [], []],
    tableau: Array.from({ length: 7 }, () => []),
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

describe('scorpion deal', () => {
  it('deals 7 columns of 7 with a 3-card stock', () => {
    const s = deal(42, 0);
    expect(s.tableau).toHaveLength(7);
    expect(s.tableau.map((p) => p.length)).toEqual([7, 7, 7, 7, 7, 7, 7]);
    expect(s.stock).toHaveLength(3);
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
  });

  it('hides the bottom three cards of columns 0..3 only', () => {
    const s = deal(42, 0);
    for (let col = 0; col < 7; col++) {
      s.tableau[col]!.forEach((c, row) => {
        const expected = !(col < 4 && row < 3);
        expect(c.faceUp).toBe(expected);
      });
    }
  });

  it('uses every one of the 52 cards', () => {
    const s = deal(42, 0);
    const all = [...s.tableau.flat(), ...s.stock];
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
  });

  it('is deterministic per seed', () => {
    expect(JSON.stringify(deal(9, 0))).toBe(JSON.stringify(deal(9, 0)));
  });
});

describe('scorpion runs and moves', () => {
  it('any face-up card is pickable regardless of order', () => {
    const s = emptyState();
    // An out-of-order, all-face-up group is still pickable in Scorpion.
    s.tableau[0] = [card('S', 5), card('H', 9), card('S', 2)];
    expect(canPickRun(s, { kind: 'tableau', index: 0 }, 2)).toBe(true);
    // A face-down card at the picked depth blocks the pick.
    s.tableau[1] = [card('S', 9, false), card('S', 8)];
    expect(canPickRun(s, { kind: 'tableau', index: 1 }, 1)).toBe(false);
    expect(canPickRun(s, { kind: 'tableau', index: 1 }, 0)).toBe(true);
  });

  it('builds down in suit only', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 8)];
    s.tableau[1] = [card('S', 9)];
    s.tableau[2] = [card('H', 9)];
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 1)).toBe(true);
    // Same rank but wrong suit is rejected.
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 2 }, 1)).toBe(false);
  });

  it('moves an unordered face-up group keyed by its lead card', () => {
    const s = emptyState();
    // Lead (deepest) is S8; the junk on top comes along regardless of order.
    s.tableau[0] = [card('S', 8), card('D', 2), card('H', 5)];
    s.tableau[1] = [card('S', 9)];
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 3)).toBe(true);
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 3,
    });
    expect(s.tableau[0]).toHaveLength(0);
    expect(s.tableau[1]!.map((c) => c.rank)).toEqual([9, 8, 2, 5]);
  });

  it('only a King may lead onto an empty column', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 13), card('H', 4)];
    s.tableau[1] = [card('S', 5)];
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 2 }, 2)).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 1 }, { kind: 'tableau', index: 2 }, 1)).toBe(false);
  });

  it('moving exposes and flips the card underneath', () => {
    const s = emptyState();
    s.tableau[0] = [card('D', 3, false), card('S', 8)];
    s.tableau[1] = [card('S', 9)];
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 1,
    });
    expect(s.tableau[0]![0]!.faceUp).toBe(true);
  });
});

describe('scorpion run completion', () => {
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
    // K..2 spades plus a King to lead the off-suit ace onto an empty column.
    s.tableau[0] = pileWithRun('S');
    s.tableau[1] = [card('H', 13), card('H', 1)]; // off-suit ace on top
    // Move the off-suit ace onto the spade run: same rank+1 but wrong suit, so
    // canMove rejects it and the run must not sweep.
    expect(
      canMove(s, { kind: 'tableau', index: 1 }, { kind: 'tableau', index: 0 }, 1),
    ).toBe(false);
    expect(s.foundations.every((f) => f.length === 0)).toBe(true);
  });

  it('four completed runs win the game', () => {
    const s = emptyState();
    for (let i = 0; i < 4; i++) {
      s.foundations[i] = Array.from({ length: 13 }, (_, r) => card('S', 13 - r));
    }
    expect(isWon(s)).toBe(true);
  });
});

describe('scorpion stock', () => {
  it('can draw whenever stock remains, even over empty columns', () => {
    const s = emptyState();
    s.stock = [card('S', 2, false), card('H', 3, false), card('D', 4, false)];
    expect(canDraw(s)).toBe(true);
    s.stock = [];
    expect(canDraw(s)).toBe(false);
  });

  it('deals the three stock cards face up onto columns 0..2', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 13)];
    s.tableau[1] = [];
    s.tableau[2] = [card('H', 6)];
    const a = card('S', 2, false);
    const b = card('H', 3, false);
    const c = card('D', 4, false);
    s.stock = [c, b, a]; // popped in order a, b, c
    applyMove(s, { type: 'draw' });
    expect(s.stock).toHaveLength(0);
    expect(top(s.tableau[0]!)!.id).toBe(a.id);
    expect(top(s.tableau[1]!)!.id).toBe(b.id);
    expect(top(s.tableau[2]!)!.id).toBe(c.id);
    expect(top(s.tableau[0]!)!.faceUp).toBe(true);
    expect(top(s.tableau[1]!)!.faceUp).toBe(true);
    expect(top(s.tableau[2]!)!.faceUp).toBe(true);
  });
});

describe('scorpion tap and hints', () => {
  it('tap prefers a same-suit continuation', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 8)];
    s.tableau[1] = [card('H', 9)]; // not same suit -> not a legal target anyway
    s.tableau[2] = [card('S', 9)];
    const move = autoMoveFor(s, { kind: 'tableau', index: 0 }, 0);
    expect(move).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 2 },
      count: 1,
    });
  });

  it('hint prefers a same-suit join that flips a card', () => {
    const s = emptyState();
    s.tableau[0] = [card('D', 4, false), card('S', 8)];
    s.tableau[1] = [card('S', 9)];
    s.stock = [card('S', 2, false)];
    const hint = findHint(s);
    expect(hint).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 1,
    });
  });

  it('hint does not ping-pong a run already on a same-suit build', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 9), card('S', 8)]; // S8 already continues S9
    s.tableau[1] = [card('S', 9)];
    expect(findHint(s)).toBeNull();
  });

  it('hint falls back to dealing', () => {
    const s = emptyState();
    s.tableau.forEach((p) => p.push(card('H', 5)));
    s.stock = [card('S', 9, false), card('S', 9, false), card('S', 9, false)];
    expect(findHint(s)).toEqual({ type: 'draw' });
  });
});

function top(pile: Card[]): Card | undefined {
  return pile[pile.length - 1];
}
