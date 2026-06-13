import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './deck';
import { type GameState, cloneState, deserialize, serialize } from './types';
import {
  applyMove,
  canDraw,
  canMove,
  canRecycle,
  deal,
  findHint,
  fitsOnFoundation,
  fitsOnTableau,
  foundationTargetFor,
  isTriviallyWinnable,
  isWon,
  nextAutoCompleteMove,
} from './fortythieves';
import { History } from '../../lib/history';

function card(suit: Suit, rank: number, faceUp = true): Card {
  return { id: `${suit}${rank}`, suit, rank: rank as Rank, faceUp };
}

function emptyState(): GameState {
  return {
    game: 'fortythieves' as const,
    seed: 0,
    variant: 0,
    stock: [],
    waste: [],
    cells: [],
    foundations: [[], [], [], [], [], [], [], []],
    tableau: [[], [], [], [], [], [], [], [], [], []],
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

describe('deal', () => {
  it('deals the standard Forty Thieves layout', () => {
    const s = deal(42);
    expect(s.tableau).toHaveLength(10);
    expect(s.tableau.map((p) => p.length)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(s.foundations).toHaveLength(8);
    expect(s.stock).toHaveLength(64);
    expect(s.waste).toHaveLength(0);
    // All 40 tableau cards are face up.
    for (const pile of s.tableau) {
      for (const c of pile) expect(c.faceUp).toBe(true);
    }
    for (const c of s.stock) expect(c.faceUp).toBe(false);
    // 40 + 64 = 104 total cards.
    const total =
      s.tableau.reduce((n, p) => n + p.length, 0) + s.stock.length + s.waste.length;
    expect(total).toBe(104);
    expect(s.game).toBe('fortythieves');
    expect(s.variant).toBe(0);
    expect(s.score).toBe(0);
  });

  it('is deterministic per seed', () => {
    const a = deal(7);
    const b = deal(7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('tableau rules', () => {
  it('accepts same-suit descending', () => {
    expect(fitsOnTableau(card('S', 9), card('S', 10))).toBe(true);
    expect(fitsOnTableau(card('H', 5), card('H', 6))).toBe(true);
  });

  it('rejects different suit or wrong rank', () => {
    expect(fitsOnTableau(card('H', 9), card('S', 10))).toBe(false);
    expect(fitsOnTableau(card('C', 9), card('S', 10))).toBe(false);
    expect(fitsOnTableau(card('S', 8), card('S', 10))).toBe(false);
    expect(fitsOnTableau(card('S', 11), card('S', 10))).toBe(false);
  });

  it('accepts any card on an empty column', () => {
    expect(fitsOnTableau(card('H', 13), undefined)).toBe(true);
    expect(fitsOnTableau(card('C', 7), undefined)).toBe(true);
    expect(fitsOnTableau(card('D', 1), undefined)).toBe(true);
  });
});

describe('foundation rules', () => {
  it('accepts only aces on empty foundations', () => {
    expect(fitsOnFoundation(card('S', 1), [])).toBe(true);
    expect(fitsOnFoundation(card('S', 2), [])).toBe(false);
  });

  it('builds same suit ascending', () => {
    expect(fitsOnFoundation(card('S', 2), [card('S', 1)])).toBe(true);
    expect(fitsOnFoundation(card('H', 2), [card('S', 1)])).toBe(false);
    expect(fitsOnFoundation(card('S', 3), [card('S', 1)])).toBe(false);
  });
});

describe('moves', () => {
  it('builds a single card same-suit on the tableau', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 10)];
    s.tableau[1] = [card('S', 9)];
    expect(
      canMove(s, { kind: 'tableau', index: 1 }, { kind: 'tableau', index: 0 }, 1),
    ).toBe(true);
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 1 },
      to: { kind: 'tableau', index: 0 },
      count: 1,
    });
    expect(s.tableau[0]!.map((c) => c.id)).toEqual(['S10', 'S9']);
    expect(s.tableau[1]).toHaveLength(0);
  });

  it('allows any single card onto an empty column', () => {
    const s = emptyState();
    s.tableau[0] = [card('H', 4)];
    // index 1 is empty
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 1),
    ).toBe(true);
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 1,
    });
    expect(s.tableau[1]!.map((c) => c.id)).toEqual(['H4']);
  });

  it('moves a single card to a foundation', () => {
    const s = emptyState();
    s.foundations[2] = [card('D', 1)];
    s.tableau[0] = [card('D', 2)];
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'foundation', index: 2 }, 1),
    ).toBe(true);
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'foundation', index: 2 },
      count: 1,
    });
    expect(s.foundations[2]!.map((c) => c.id)).toEqual(['D1', 'D2']);
  });

  it('rejects group moves (count > 1 is illegal)', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 10), card('S', 9)];
    s.tableau[1] = [card('S', 11)];
    // A 2-card same-suit run that would otherwise be a valid build is rejected.
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 2),
    ).toBe(false);
    expect(() =>
      applyMove(s, {
        type: 'move',
        from: { kind: 'tableau', index: 0 },
        to: { kind: 'tableau', index: 1 },
        count: 2,
      }),
    ).toThrow();
  });

  it('rejects foundation and stock as a move source', () => {
    const s = emptyState();
    s.foundations[0] = [card('H', 1)];
    s.stock = [card('C', 5, false)];
    s.tableau[0] = [card('S', 2)];
    expect(
      canMove(s, { kind: 'foundation', index: 0 }, { kind: 'tableau', index: 0 }, 1),
    ).toBe(false);
    expect(
      canMove(s, { kind: 'stock', index: 0 }, { kind: 'tableau', index: 0 }, 1),
    ).toBe(false);
  });

  it('draw moves one card to the waste face up', () => {
    const s = deal(1);
    const stockBefore = s.stock.length;
    expect(canDraw(s)).toBe(true);
    applyMove(s, { type: 'draw' });
    expect(s.waste).toHaveLength(1);
    expect(s.stock).toHaveLength(stockBefore - 1);
    expect(s.waste[0]!.faceUp).toBe(true);
  });

  it('moves the waste top card to a foundation', () => {
    const s = emptyState();
    s.foundations[0] = [card('S', 1)];
    s.waste = [card('S', 2)];
    expect(
      canMove(s, { kind: 'waste', index: 0 }, { kind: 'foundation', index: 0 }, 1),
    ).toBe(true);
  });

  it('does not recycle when the stock is empty', () => {
    const s = deal(1);
    while (s.stock.length) applyMove(s, { type: 'draw' });
    expect(s.stock).toHaveLength(0);
    expect(s.waste.length).toBeGreaterThan(0);
    expect(canRecycle(s)).toBe(false);
    expect(canDraw(s)).toBe(false);
    expect(() => applyMove(s, { type: 'recycle' })).toThrow();
    // Stock stays empty.
    expect(s.stock).toHaveLength(0);
  });

  it('throws on illegal moves', () => {
    const s = emptyState();
    expect(() => applyMove(s, { type: 'draw' })).toThrow();
    expect(() =>
      applyMove(s, {
        type: 'move',
        from: { kind: 'tableau', index: 0 },
        to: { kind: 'tableau', index: 1 },
        count: 1,
      }),
    ).toThrow();
  });
});

describe('win detection and auto-complete', () => {
  function nearWinState(): GameState {
    // Two copies of every suit on the 8 foundations up to queen; the eight
    // kings sit on the tableau.
    const s = emptyState();
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    for (let copy = 0; copy < 2; copy++) {
      suits.forEach((suit, si) => {
        const fi = copy * 4 + si;
        s.foundations[fi] = [];
        for (let r = 1; r <= 12; r++) s.foundations[fi]!.push(card(suit, r));
        s.tableau[fi] = [card(suit, 13)];
      });
    }
    return s;
  }

  it('detects a won game (all 8 foundations length 13)', () => {
    const s = nearWinState();
    expect(isWon(s)).toBe(false);
    for (let i = 0; i < 8; i++) {
      s.foundations[i]!.push(s.tableau[i]!.pop()!);
    }
    expect(isWon(s)).toBe(true);
  });

  it('flags trivially winnable positions', () => {
    const s = nearWinState();
    expect(isTriviallyWinnable(s)).toBe(true);
    s.stock.push(card('S', 13, false));
    expect(isTriviallyWinnable(s)).toBe(false);
  });

  it('auto-complete plays to a win', () => {
    const s = nearWinState();
    let guard = 0;
    for (let m = nextAutoCompleteMove(s); m; m = nextAutoCompleteMove(s)) {
      applyMove(s, m);
      if (++guard > 200) throw new Error('auto-complete did not terminate');
    }
    expect(isWon(s)).toBe(true);
  });
});

describe('foundationTargetFor', () => {
  it('finds the matching foundation for a waste card', () => {
    const s = emptyState();
    s.foundations[2] = [card('D', 1)];
    s.waste = [card('D', 2)];
    expect(foundationTargetFor(s, { kind: 'waste', index: 0 })).toEqual({
      kind: 'foundation',
      index: 2,
    });
  });

  it('sends aces to an empty foundation', () => {
    const s = emptyState();
    s.waste = [card('C', 1)];
    expect(foundationTargetFor(s, { kind: 'waste', index: 0 })?.kind).toBe('foundation');
  });
});

describe('hints', () => {
  it('prefers waste → foundation', () => {
    const s = emptyState();
    s.waste = [card('S', 1)];
    s.stock = [card('H', 5, false)];
    expect(findHint(s)).toEqual({
      type: 'move',
      from: { kind: 'waste', index: 0 },
      to: { kind: 'foundation', index: 0 },
      count: 1,
    });
  });

  it('suggests a same-suit tableau build', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 9)];
    s.tableau[1] = [card('S', 10)];
    expect(findHint(s)).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 1,
    });
  });

  it('suggests a draw when a stock card is playable', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 10)];
    s.stock = [card('S', 9, false)]; // playable on S10 once drawn
    expect(findHint(s)).toEqual({ type: 'draw' });
  });

  it('reports a dead game instead of endless draws', () => {
    const s = emptyState();
    // Every column occupied (no empty column to park on) and the lone stock
    // card fits nothing on top and no foundation.
    for (let i = 0; i < 10; i++) s.tableau[i] = [card('S', 5)];
    s.stock = [card('H', 7, false)]; // not S6-on-S5 anywhere, no foundation
    expect(findHint(s)).toBeNull();
  });
});

describe('history', () => {
  it('undo and redo round-trip', () => {
    const s = deal(5);
    const h = new History<GameState>(cloneState);
    const before = cloneState(s);
    h.push(s);
    applyMove(s, { type: 'draw' });
    const after = cloneState(s);

    const undone = h.undo(s);
    expect(undone).not.toBeNull();
    expect(JSON.stringify(undone)).toBe(JSON.stringify(before));

    const redone = h.redo(undone!);
    expect(JSON.stringify(redone)).toBe(JSON.stringify(after));
  });
});

describe('serialization', () => {
  it('round-trips a game state', () => {
    const s = deal(99);
    applyMove(s, { type: 'draw' });
    const json = serialize(s, 12_000);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    expect(restored!.elapsedMs).toBe(12_000);
    expect(JSON.stringify(restored!.state)).toBe(JSON.stringify(s));
  });
});
