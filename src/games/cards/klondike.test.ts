import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './deck';
import { type GameState, cloneState, deserialize, serialize } from './types';
import {
  applyMove,
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
} from './klondike';
import { History } from '../../lib/history';

function card(suit: Suit, rank: number, faceUp = true): Card {
  return { id: `${suit}${rank}`, suit, rank: rank as Rank, faceUp };
}

function emptyState(): GameState {
  return {
    game: 'klondike' as const,
    seed: 0,
    variant: 1,
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
  it('deals the standard Klondike layout', () => {
    const s = deal(42, 1);
    expect(s.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toHaveLength(0);
    for (const pile of s.tableau) {
      pile.forEach((c, i) => expect(c.faceUp).toBe(i === pile.length - 1));
    }
    for (const c of s.stock) expect(c.faceUp).toBe(false);
  });

  it('is deterministic per seed', () => {
    const a = deal(7, 3);
    const b = deal(7, 3);
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

describe('moves', () => {
  it('draw moves drawMode cards to waste face up', () => {
    const s = deal(1, 3);
    applyMove(s, { type: 'draw' });
    expect(s.waste).toHaveLength(3);
    expect(s.stock).toHaveLength(21);
    expect(s.waste.every((c) => c.faceUp)).toBe(true);
  });

  it('draw 1 moves a single card', () => {
    const s = deal(1, 1);
    applyMove(s, { type: 'draw' });
    expect(s.waste).toHaveLength(1);
  });

  it('recycle returns waste to stock face down, preserving cycle order', () => {
    const s = deal(1, 1);
    const order: string[] = [];
    while (s.stock.length) {
      applyMove(s, { type: 'draw' });
      order.push(s.waste[s.waste.length - 1]!.id);
    }
    expect(canRecycle(s)).toBe(true);
    applyMove(s, { type: 'recycle' });
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toHaveLength(0);
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
    applyMove(s, { type: 'draw' });
    expect(s.waste[0]!.id).toBe(order[0]);
  });

  it('moving a tableau run flips the exposed card', () => {
    const s = emptyState();
    s.tableau[0] = [card('C', 5, false), card('S', 10), card('H', 9)];
    s.tableau[1] = [card('D', 11)];
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 2),
    ).toBe(true);
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 2,
    });
    expect(s.tableau[1]!.map((c) => c.id)).toEqual(['D11', 'S10', 'H9']);
    expect(s.tableau[0]).toHaveLength(1);
    expect(s.tableau[0]![0]!.faceUp).toBe(true);
  });

  it('rejects moving a run containing face-down cards', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 10, false), card('H', 9)];
    s.tableau[1] = [card('D', 11)];
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 2),
    ).toBe(false);
  });

  it('rejects multi-card moves to a foundation', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 2), card('H', 1)];
    expect(
      canMove(s, { kind: 'tableau', index: 0 }, { kind: 'foundation', index: 0 }, 2),
    ).toBe(false);
  });

  it('allows foundation → tableau', () => {
    const s = emptyState();
    s.foundations[0] = [card('H', 1), card('H', 2), card('H', 3)];
    s.tableau[0] = [card('S', 4)];
    expect(
      canMove(s, { kind: 'foundation', index: 0 }, { kind: 'tableau', index: 0 }, 1),
    ).toBe(true);
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
    s.stock.push(card('S', 13, false));
    expect(isTriviallyWinnable(s)).toBe(false);
  });

  it('auto-complete plays to a win', () => {
    const s = nearWinState();
    let guard = 0;
    for (let m = nextAutoCompleteMove(s); m; m = nextAutoCompleteMove(s)) {
      applyMove(s, m);
      if (++guard > 60) throw new Error('auto-complete did not terminate');
    }
    expect(isWon(s)).toBe(true);
  });

  it('auto-complete clears a fully face-up tableau with buried low cards', () => {
    const s = emptyState();
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    // Foundations up to 8; remaining 9..K spread across tableau with
    // legal descending runs stacked on exposed cards.
    suits.forEach((suit, i) => {
      s.foundations[i] = [];
      for (let r = 1; r <= 8; r++) s.foundations[i]!.push(card(suit, r));
    });
    s.tableau[0] = [card('S', 13), card('H', 12), card('S', 11), card('D', 10), card('C', 9)];
    s.tableau[1] = [card('H', 13), card('C', 12), card('H', 11), card('S', 10), card('H', 9)];
    s.tableau[2] = [card('D', 13), card('S', 12), card('D', 11), card('C', 10), card('D', 9)];
    s.tableau[3] = [card('C', 13), card('D', 12), card('C', 11), card('H', 10), card('S', 9)];
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

describe('history', () => {
  it('undo and redo round-trip', () => {
    const s = deal(5, 1);
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

  it('new moves clear the redo stack', () => {
    const s = deal(5, 1);
    const h = new History<GameState>(cloneState);
    h.push(s);
    applyMove(s, { type: 'draw' });
    const undone = h.undo(s)!;
    expect(h.canRedo).toBe(true);
    h.push(undone);
    expect(h.canRedo).toBe(false);
  });
});

describe('hints', () => {
  it('prefers waste → foundation', () => {
    const s = emptyState();
    s.waste = [card('S', 1)];
    s.stock = [card('H', 5, false)];
    const hint = findHint(s);
    expect(hint).toEqual({
      type: 'move',
      from: { kind: 'waste', index: 0 },
      to: { kind: 'foundation', index: 0 },
      count: 1,
    });
  });

  it('suggests a revealing tableau move over drawing', () => {
    const s = emptyState();
    s.tableau[0] = [card('C', 5, false), card('H', 9)];
    s.tableau[1] = [card('S', 10)];
    s.stock = [card('D', 7, false)];
    const hint = findHint(s);
    expect(hint).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'tableau', index: 1 },
      count: 1,
    });
  });

  it('does not suggest shuffling a king between empty columns', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 13)];
    s.stock = [card('D', 7, false)];
    const hint = findHint(s);
    expect(hint).toEqual({ type: 'draw' });
  });

  it('falls back to recycle when stuck with an empty stock', () => {
    const s = emptyState();
    s.waste = [card('D', 7)];
    s.tableau[0] = [card('S', 13)];
    const hint = findHint(s);
    expect(hint).toEqual({ type: 'recycle' });
  });
});

describe('serialization', () => {
  it('round-trips a game state', () => {
    const s = deal(99, 3);
    applyMove(s, { type: 'draw' });
    const json = serialize(s, 12_000);
    const restored = deserialize(json);
    expect(restored).not.toBeNull();
    expect(restored!.elapsedMs).toBe(12_000);
    expect(JSON.stringify(restored!.state)).toBe(JSON.stringify(s));
  });

  it('rejects garbage', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"v":1}')).toBeNull();
    expect(deserialize('{"v":2}')).toBeNull();
  });
});

describe('full playthrough (engine smoke test)', () => {
  it('plays a constructed game from deal to win via legal moves only', () => {
    // Construct a tiny but complete scenario: put the whole deck in a
    // winnable layout, then walk it home with foundation moves.
    const s = emptyState();
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    suits.forEach((suit, i) => {
      s.tableau[i] = [];
      for (let r = 13; r >= 1; r--) s.tableau[i]!.push(card(suit, r));
    });
    let guard = 0;
    while (!isWon(s)) {
      let moved = false;
      for (let i = 0; i < 7 && !moved; i++) {
        const from = { kind: 'tableau', index: i } as const;
        const to = foundationTargetFor(s, from);
        if (to) {
          applyMove(s, { type: 'move', from, to, count: 1 });
          moved = true;
        }
      }
      expect(moved).toBe(true);
      if (++guard > 60) throw new Error('did not finish');
    }
    expect(isWon(s)).toBe(true);
    expect(s.moves).toBe(52);
  });
});
