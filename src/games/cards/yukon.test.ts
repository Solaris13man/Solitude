import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './deck';
import { type GameState, cloneState } from './types';
import {
  applyMove,
  canMove,
  canPickRun,
  deal,
  findHint,
  fitsOnFoundation,
  fitsOnTableau,
  foundationTargetFor,
  isTriviallyWinnable,
  isWon,
  nextAutoCompleteMove,
} from './yukon';

function card(suit: Suit, rank: number, faceUp = true): Card {
  return { id: `${suit}${rank}`, suit, rank: rank as Rank, faceUp };
}

function emptyState(): GameState {
  return {
    game: 'yukon' as const,
    seed: 0,
    variant: 0,
    stock: [],
    waste: [],
    cells: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

describe('deal', () => {
  it('deals the standard Yukon layout', () => {
    const s = deal(42);
    expect(s.tableau.map((p) => p.length)).toEqual([1, 6, 7, 8, 9, 10, 11]);
    expect(s.stock).toHaveLength(0);
    expect(s.waste).toHaveLength(0);
    expect(s.cells).toHaveLength(0);
    // Column 0: single face-up card.
    expect(s.tableau[0]!.every((c) => c.faceUp)).toBe(true);
    // Columns 1..6: bottom (size - 5) face down, top 5 face up.
    for (let col = 1; col < 7; col++) {
      const pile = s.tableau[col]!;
      const faceDown = pile.length - 5;
      pile.forEach((c, i) => expect(c.faceUp).toBe(i >= faceDown));
      expect(pile.filter((c) => !c.faceUp)).toHaveLength(faceDown);
    }
  });

  it('uses all 52 cards exactly once', () => {
    const s = deal(7);
    const ids = s.tableau.flat().map((c) => c.id);
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(52);
  });

  it('has correct face-down counts per column', () => {
    const s = deal(3);
    const faceDownCounts = s.tableau.map((p) => p.filter((c) => !c.faceUp).length);
    expect(faceDownCounts).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('is deterministic per seed', () => {
    const a = deal(11);
    const b = deal(11);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('tableau rules', () => {
  it('accepts alternating colors descending', () => {
    expect(fitsOnTableau(card('H', 9), card('S', 10))).toBe(true);
    expect(fitsOnTableau(card('D', 9), card('C', 10))).toBe(true);
  });

  it('rejects same color or wrong rank', () => {
    expect(fitsOnTableau(card('H', 9), card('D', 10))).toBe(false);
    expect(fitsOnTableau(card('H', 8), card('S', 10))).toBe(false);
    expect(fitsOnTableau(card('H', 11), card('S', 10))).toBe(false);
  });

  it('only kings go to empty columns', () => {
    expect(fitsOnTableau(card('H', 13), undefined)).toBe(true);
    expect(fitsOnTableau(card('H', 12), undefined)).toBe(false);
  });

  it('rejects placement on a face-down card', () => {
    expect(fitsOnTableau(card('H', 9), card('S', 10, false))).toBe(false);
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

describe('canPickRun (Yukon twist)', () => {
  it('picks up any face-up card with everything on top of it', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 7, false), card('H', 5), card('S', 2), card('D', 9)];
    // depth 0,1,2 are all face up; depth 3 is the face-down bottom card.
    expect(canPickRun(s, { kind: 'tableau', index: 0 }, 0)).toBe(true);
    expect(canPickRun(s, { kind: 'tableau', index: 0 }, 2)).toBe(true);
    expect(canPickRun(s, { kind: 'tableau', index: 0 }, 3)).toBe(false);
  });

  it('rejects non-tableau piles', () => {
    const s = emptyState();
    s.foundations[0] = [card('S', 1)];
    expect(canPickRun(s, { kind: 'foundation', index: 0 }, 0)).toBe(false);
  });
});

describe('moves', () => {
  it('moves an unordered face-up group by its lead (Yukon twist)', () => {
    const s = emptyState();
    // S10 is the lead; H4 and C2 on top do NOT form an ordered run.
    s.tableau[0] = [card('C', 5, false), card('S', 10), card('H', 4), card('C', 2)];
    s.tableau[1] = [card('D', 11)];
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 3),
    ).toBe(true);
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 3,
    });
    expect(s.tableau[1]!.map((c) => c.id)).toEqual(['D11', 'S10', 'H4', 'C2']);
  });

  it('flips the exposed face-down card after a tableau move', () => {
    const s = emptyState();
    s.tableau[0] = [card('C', 5, false), card('S', 10), card('H', 9)];
    s.tableau[1] = [card('D', 11)];
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 2,
    });
    expect(s.tableau[0]).toHaveLength(1);
    expect(s.tableau[0]![0]!.faceUp).toBe(true);
  });

  it('moves a king to an empty column', () => {
    const s = emptyState();
    s.tableau[0] = [card('C', 3, false), card('S', 13)];
    s.tableau[1] = [];
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 1),
    ).toBe(true);
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 2),
    ).toBe(false); // C3 is face down, can't lead
  });

  it('sends a single card to a foundation', () => {
    const s = emptyState();
    s.foundations[0] = [card('S', 1)];
    s.tableau[0] = [card('H', 5, false), card('S', 2)];
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'foundation', index: 0 }, 1),
    ).toBe(true);
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'foundation', index: 0 },
      count: 1,
    });
    expect(s.foundations[0]!.map((c) => c.id)).toEqual(['S1', 'S2']);
    // the exposed H5 flips face up
    expect(s.tableau[0]![0]!.faceUp).toBe(true);
  });

  it('rejects a multi-card move to a foundation', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 2), card('H', 1)];
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'foundation', index: 0 }, 2),
    ).toBe(false);
  });

  it('rejects a group whose lead does not fit the target', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 9), card('H', 4)];
    s.tableau[1] = [card('D', 11)]; // needs a black 10, not S9
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 2),
    ).toBe(false);
  });

  it('rejects moving a group containing face-down cards', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 10, false), card('H', 9)];
    s.tableau[1] = [card('D', 11)];
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 2),
    ).toBe(false);
  });

  it('throws on illegal moves', () => {
    const s = emptyState();
    expect(() =>
      applyMove(s, {
        type: 'move',
        from: { kind: 'tableau', index: 0 },
        to: { kind: 'tableau', index: 1 },
        count: 1,
      }),
    ).toThrow();
    expect(() => applyMove(s, { type: 'draw' })).toThrow();
  });
});

describe('win detection and auto-complete', () => {
  function nearWinState(): GameState {
    // Everything on foundations except the four kings on the tableau.
    const s = emptyState();
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    suits.forEach((suit, i) => {
      s.foundations[i] = [];
      for (let r = 1; r <= 12; r++) s.foundations[i]!.push(card(suit, r));
      s.tableau[i] = [card(suit, 13)];
    });
    return s;
  }

  it('detects a won game', () => {
    const s = nearWinState();
    expect(isWon(s)).toBe(false);
    for (let i = 0; i < 4; i++) {
      s.foundations[i]!.push(s.tableau[i]!.pop()!);
    }
    expect(isWon(s)).toBe(true);
  });

  it('flags trivially winnable positions', () => {
    const s = nearWinState();
    expect(isTriviallyWinnable(s)).toBe(true);
    // A face-down card disqualifies it.
    s.tableau[0]!.unshift(card('S', 5, false));
    expect(isTriviallyWinnable(s)).toBe(false);
  });

  it('rejects trivially winnable when a pile is not strictly descending', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 5), card('H', 9)]; // 5 then 9 ascending
    expect(isTriviallyWinnable(s)).toBe(false);
  });

  it('auto-complete plays to a win on a constructed state', () => {
    const s = emptyState();
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    // Fully face-up, strictly descending columns with buried low cards.
    suits.forEach((suit, i) => {
      s.tableau[i] = [];
      for (let r = 13; r >= 1; r--) s.tableau[i]!.push(card(suit, r));
    });
    expect(isTriviallyWinnable(s)).toBe(true);
    let guard = 0;
    for (let m = nextAutoCompleteMove(s); m; m = nextAutoCompleteMove(s)) {
      applyMove(s, m);
      if (++guard > 60) throw new Error('auto-complete did not terminate');
    }
    expect(isWon(s)).toBe(true);
  });
});

describe('foundationTargetFor', () => {
  it('finds the matching foundation for a tableau top card', () => {
    const s = emptyState();
    s.foundations[2] = [card('D', 1)];
    s.tableau[0] = [card('D', 2)];
    expect(foundationTargetFor(s, { kind: 'tableau', index: 0 })).toEqual({
      kind: 'foundation',
      index: 2,
    });
  });

  it('sends aces to an empty foundation', () => {
    const s = emptyState();
    s.tableau[0] = [card('C', 1)];
    expect(foundationTargetFor(s, { kind: 'tableau', index: 0 })?.kind).toBe('foundation');
  });
});

describe('hints', () => {
  it('prefers a foundation play', () => {
    const s = emptyState();
    s.foundations[0] = [card('S', 1)];
    s.tableau[0] = [card('S', 2)];
    expect(findHint(s)).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'foundation', index: 0 },
      count: 1,
    });
  });

  it('suggests a revealing tableau move', () => {
    const s = emptyState();
    s.tableau[0] = [card('C', 5, false), card('H', 9)];
    s.tableau[1] = [card('S', 10)];
    expect(findHint(s)).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 1,
    });
  });

  it('does not suggest shuffling a king between empty columns', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 13)];
    s.tableau[1] = [];
    expect(findHint(s)).toBeNull();
  });
});

describe('history clone', () => {
  it('clone round-trips a dealt state', () => {
    const s = deal(5);
    const c = cloneState(s);
    expect(JSON.stringify(c)).toBe(JSON.stringify(s));
  });
});
