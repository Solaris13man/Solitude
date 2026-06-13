import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './deck';
import type { GameState } from './types';
import {
  applyMove,
  canMove,
  canPickRun,
  deal,
  isTriviallyWinnable,
  isWon,
  moveCapacity,
} from './eightoff';

function card(suit: Suit, rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank: rank as Rank, faceUp: true };
}

function emptyState(): GameState {
  return {
    game: 'eightoff',
    seed: 0,
    variant: 0,
    stock: [],
    waste: [],
    cells: Array.from({ length: 8 }, () => []),
    foundations: [[], [], [], []],
    tableau: Array.from({ length: 8 }, () => []),
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

describe('eightoff deal', () => {
  it('deals 8 columns of 6 all face up, four cells filled and four empty', () => {
    const s = deal(42);
    expect(s.tableau.map((p) => p.length)).toEqual([6, 6, 6, 6, 6, 6, 6, 6]);
    expect(s.tableau.flat()).toHaveLength(48);
    expect(s.tableau.flat().every((c) => c.faceUp)).toBe(true);
    expect(s.cells.map((c) => c.length)).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
    expect(s.cells.flat()).toHaveLength(4);
    // 52 cards total across tableau + cells.
    expect(s.tableau.flat().length + s.cells.flat().length).toBe(52);
    expect(s.stock).toHaveLength(0);
    expect(s.foundations.every((p) => p.length === 0)).toBe(true);
  });

  it('is deterministic per seed', () => {
    expect(JSON.stringify(deal(5))).toBe(JSON.stringify(deal(5)));
  });
});

describe('eightoff moves', () => {
  it('cascades build down in suit', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 9)];
    s.tableau[1] = [card('S', 10)]; // same suit, rank+1 — legal
    s.tableau[2] = [card('C', 10)]; // wrong suit — illegal
    s.tableau[3] = [card('H', 10)]; // wrong suit (and colour) — illegal
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 1)).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 2 }, 1)).toBe(false);
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 3 }, 1)).toBe(false);
  });

  it('only a King may lead an empty column', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 13)]; // King
    s.tableau[1] = [card('S', 7)]; // non-King
    // column 2 is empty
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 2 }, 1)).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 1 }, { kind: 'tableau', index: 2 }, 1)).toBe(false);
  });

  it('single cards move to an empty free cell and to a foundation', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 5)];
    // empty cell accepts a single card
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'cell', index: 4 }, 1)).toBe(true);
    s.cells[4] = [card('H', 2)];
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'cell', index: 4 }, 1)).toBe(false);

    // foundation accepts an ace, then builds up in suit
    s.tableau[1] = [card('D', 1)];
    applyMove(s, {
      type: 'move',
      from: { kind: 'tableau', index: 1 },
      to: { kind: 'foundation', index: 2 },
      count: 1,
    });
    expect(s.foundations[2]).toHaveLength(1);
    expect(s.score).toBe(10);
  });

  it('cell cards can return to a column or foundation', () => {
    const s = emptyState();
    s.cells[1] = [card('H', 1)];
    expect(canMove(s, { kind: 'cell', index: 1 }, { kind: 'foundation', index: 0 }, 1)).toBe(true);
    s.cells[2] = [card('C', 9)];
    s.tableau[0] = [card('C', 10)]; // same suit — accepts the 9
    expect(canMove(s, { kind: 'cell', index: 2 }, { kind: 'tableau', index: 0 }, 1)).toBe(true);
  });

  it('does not allow moving cards off foundations', () => {
    const s = emptyState();
    s.foundations[0] = [card('H', 1), card('H', 2), card('H', 3)];
    s.tableau[0] = [card('H', 4)];
    expect(canMove(s, { kind: 'foundation', index: 0 }, { kind: 'tableau', index: 0 }, 1)).toBe(false);
    expect(canMove(s, { kind: 'foundation', index: 0 }, { kind: 'cell', index: 0 }, 1)).toBe(false);
    expect(canPickRun(s, { kind: 'foundation', index: 0 }, 0)).toBe(false);
  });
});

describe('eightoff supermoves', () => {
  it('allows a same-suit run within capacity and rejects one exceeding it', () => {
    const s = emptyState();
    // A same-suit descending 3-run: S8 S7 S6.
    s.tableau[0] = [card('S', 8), card('S', 7), card('S', 6)];
    s.tableau[1] = [card('S', 9)]; // run lands on the 9 of spades
    // Fill all 8 cells so capacity = (0+1) * 2^0 = 1 (no empty columns either).
    const fillers: Suit[] = ['H', 'H', 'H', 'H', 'D', 'D', 'D', 'D'];
    s.cells = fillers.map((suit, i) => [card(suit, i + 1)]);
    // Keep remaining columns occupied so there are no empty columns.
    for (let i = 2; i < 8; i++) s.tableau[i] = [card('C', 13)];
    expect(moveCapacity(s, null)).toBe(1);
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 3)).toBe(false);

    // Free two cells: capacity = (2+1) * 2^0 = 3 ≥ 3.
    s.cells[0] = [];
    s.cells[1] = [];
    expect(moveCapacity(s, null)).toBe(3);
    expect(canMove(s, { kind: 'tableau', index: 0 }, { kind: 'tableau', index: 1 }, 3)).toBe(true);
  });

  it('only a same-suit descending suffix is pickable', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 8), card('S', 7), card('S', 6)]; // same-suit run
    s.tableau[1] = [card('H', 5), card('D', 4)]; // not same suit
    expect(canPickRun(s, { kind: 'tableau', index: 0 }, 2)).toBe(true);
    expect(canPickRun(s, { kind: 'tableau', index: 1 }, 1)).toBe(false);
    expect(canPickRun(s, { kind: 'cell', index: 0 }, 0)).toBe(false); // empty cell
  });
});

describe('eightoff win and auto-complete', () => {
  it('isWon when all four foundations are full', () => {
    const s = emptyState();
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    suits.forEach((suit, i) => {
      s.foundations[i] = [];
      for (let r = 1; r <= 13; r++) s.foundations[i]!.push(card(suit, r));
    });
    expect(isWon(s)).toBe(true);
  });

  it('detects a trivially winnable layout (descending columns)', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 13), card('H', 12), card('S', 3)];
    expect(isTriviallyWinnable(s)).toBe(true);
    s.tableau[1] = [card('D', 2), card('D', 5)];
    expect(isTriviallyWinnable(s)).toBe(false);
  });
});
