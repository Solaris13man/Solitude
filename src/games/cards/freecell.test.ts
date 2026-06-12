import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './deck';
import type { GameState } from './types';
import {
  applyMove,
  canMove,
  canPickRun,
  deal,
  findHint,
  isTriviallyWinnable,
  isWon,
  moveCapacity,
  nextAutoCompleteMove,
} from './freecell';

function card(suit: Suit, rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank: rank as Rank, faceUp: true };
}

function emptyState(): GameState {
  return {
    game: 'freecell',
    seed: 0,
    variant: 0,
    stock: [],
    waste: [],
    cells: [[], [], [], []],
    foundations: [[], [], [], []],
    tableau: Array.from({ length: 8 }, () => []),
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

describe('freecell deal', () => {
  it('deals 7,7,7,7,6,6,6,6 all face up', () => {
    const s = deal(42);
    expect(s.tableau.map((p) => p.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    expect(s.tableau.flat().every((c) => c.faceUp)).toBe(true);
    expect(s.stock).toHaveLength(0);
    expect(s.cells.every((c) => c.length === 0)).toBe(true);
  });

  it('is deterministic per seed', () => {
    expect(JSON.stringify(deal(5))).toBe(JSON.stringify(deal(5)));
  });
});

describe('freecell moves', () => {
  it('single cards move to empty cells only', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 5)];
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'cell', index: 0 }, 1)).toBe(true);
    s.cells[0] = [card('H', 2)];
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'cell', index: 0 }, 1)).toBe(false);
  });

  it('cascades build down with alternating colors', () => {
    const s = emptyState();
    s.tableau[0] = [card('H', 9)];
    s.tableau[1] = [card('S', 10)];
    s.tableau[2] = [card('D', 10)];
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 1)).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 2 }, 1)).toBe(false);
  });

  it('cell cards can come back to cascades and foundations', () => {
    const s = emptyState();
    s.cells[1] = [card('H', 1)];
    expect(canMove(s, { kind: 'cell', index: 1 }, { kind: 'foundation', index: 0 }, 1)).toBe(true);
    s.cells[2] = [card('C', 9)];
    s.tableau[0] = [card('D', 10)];
    expect(canMove(s, { kind: 'cell', index: 2 }, { kind: 'tableau', index: 0 }, 1)).toBe(true);
  });

  it('supermove capacity gates multi-card moves', () => {
    const s = emptyState();
    // A 3-card run with zero free cells and no empties cannot move...
    s.cells = [[card('S', 2)], [card('S', 3)], [card('S', 4)], [card('S', 5)]];
    s.tableau[0] = [card('H', 9), card('S', 8), card('D', 7)];
    s.tableau[1] = [card('C', 10)];
    s.tableau.forEach((p, i) => {
      if (i > 1 && p.length === 0) p.push(card('C', 13));
    });
    expect(moveCapacity(s, null)).toBe(1);
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 3)).toBe(false);
    // ...but freeing two cells allows it: (2+1) ≥ 3.
    s.cells[0] = [];
    s.cells[1] = [];
    expect(moveCapacity(s, null)).toBe(3);
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 3)).toBe(true);
  });

  it('an empty target cascade does not count toward its own capacity', () => {
    const s = emptyState();
    s.cells = [[card('S', 2)], [card('S', 3)], [card('S', 4)], [card('S', 5)]];
    s.tableau[0] = [card('H', 9), card('S', 8), card('D', 7)];
    s.tableau.forEach((p, i) => {
      if (i > 1 && p.length === 0) p.push(card('C', 13));
    });
    // tableau[1] is the only empty pile: capacity toward it is just 1.
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 3)).toBe(false);
  });

  it('foundations build up by suit from the ace', () => {
    const s = emptyState();
    s.tableau[0] = [card('D', 1)];
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'foundation', index: 2 },
      count: 1,
    });
    expect(s.foundations[2]).toHaveLength(1);
    expect(s.score).toBe(10);
  });
});

describe('freecell pickup rules', () => {
  it('only valid alternating runs within capacity are pickable', () => {
    const s = emptyState();
    s.tableau[0] = [card('H', 9), card('S', 8), card('D', 7)];
    s.tableau[1] = [card('H', 5), card('H', 4)];
    expect(canPickRun(s, { kind: 'tableau', index: 0 }, 2)).toBe(true);
    expect(canPickRun(s, { kind: 'tableau', index: 1 }, 1)).toBe(false);
    expect(canPickRun(s, { kind: 'cell', index: 0 }, 0)).toBe(false); // empty cell
  });
});

describe('freecell auto-complete and win', () => {
  it('detects a trivially winnable layout (descending piles)', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 13), card('H', 12), card('S', 3)];
    expect(isTriviallyWinnable(s)).toBe(true);
    s.tableau[1] = [card('D', 2), card('D', 5)];
    expect(isTriviallyWinnable(s)).toBe(false);
  });

  it('auto-completes from cells and cascades to a win', () => {
    const s = emptyState();
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    suits.forEach((suit, i) => {
      s.foundations[i] = [];
      for (let r = 1; r <= 11; r++) s.foundations[i]!.push(card(suit, r));
      s.tableau[i] = [card(suit, 13), card(suit, 12)];
    });
    s.cells[0] = [s.tableau[0]!.pop()!]; // park a queen in a cell
    let guard = 0;
    for (let m = nextAutoCompleteMove(s); m; m = nextAutoCompleteMove(s)) {
      applyMove(s, m);
      if (++guard > 20) throw new Error('did not terminate');
    }
    expect(isWon(s)).toBe(true);
  });
});

describe('freecell hints', () => {
  it('prefers foundation plays', () => {
    const s = emptyState();
    s.cells[0] = [card('C', 1)];
    s.tableau[0] = [card('H', 9)];
    s.tableau[1] = [card('S', 10)];
    expect(findHint(s)).toEqual({
      type: 'move',
      from: { kind: 'cell', index: 0 },
      to: { kind: 'foundation', index: 0 },
      count: 1,
    });
  });

  it('suggests cascade builds before cell drops', () => {
    const s = emptyState();
    s.tableau[0] = [card('H', 9)];
    s.tableau[1] = [card('S', 10)];
    const hint = findHint(s)!;
    expect(hint.type).toBe('move');
    if (hint.type === 'move') expect(hint.to.kind).toBe('tableau');
  });
});
