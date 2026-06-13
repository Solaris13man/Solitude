import { type Card, shuffledDeck } from './deck';
import {
  type GameState,
  type Move,
  type PileRef,
  type Ruleset,
  getPile,
  top,
} from './types';

/**
 * Golf Solitaire: seven columns of five face-up cards; play any exposed card
 * onto the waste when it's one rank above or below the waste top (no
 * wrap-around). Flip from the stock when stuck. Clear the columns to win.
 */

export function deal(seed: number): GameState {
  const deck = shuffledDeck(seed);
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < 7; col++) {
    const pile: Card[] = [];
    for (let row = 0; row < 5; row++) {
      pile.push({ ...deck[cursor++]!, faceUp: true });
    }
    tableau.push(pile);
  }
  const waste = [{ ...deck[cursor++]!, faceUp: true }];
  const stock = deck.slice(cursor).map((c) => ({ ...c, faceUp: false }));
  return {
    game: 'golf',
    seed,
    variant: 0,
    stock,
    waste,
    cells: [],
    foundations: [],
    tableau,
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

function adjacent(a: Card, b: Card): boolean {
  return Math.abs(a.rank - b.rank) === 1;
}

export function canMove(state: GameState, from: PileRef, to: PileRef, count: number): boolean {
  if (from.kind !== 'tableau' || to.kind !== 'waste' || count !== 1) return false;
  const card = top(getPile(state, from));
  const base = top(state.waste);
  return !!card && !!base && adjacent(card, base);
}

export function canDraw(state: GameState): boolean {
  return state.stock.length > 0;
}

export function applyMove(state: GameState, move: Move): void {
  switch (move.type) {
    case 'draw': {
      if (!canDraw(state)) throw new Error('illegal draw');
      const card = state.stock.pop()!;
      card.faceUp = true;
      state.waste.push(card);
      state.moves++;
      return;
    }
    case 'recycle':
      throw new Error('golf has no recycle');
    case 'move': {
      if (!canMove(state, move.from, move.to, move.count)) throw new Error('illegal move');
      const source = getPile(state, move.from);
      state.waste.push(source.pop()!);
      state.moves++;
      state.score += 5;
      return;
    }
  }
}

export function isWon(state: GameState): boolean {
  return state.game === 'golf' && state.tableau.every((p) => p.length === 0);
}

export function canPickRun(state: GameState, ref: PileRef, depth: number): boolean {
  return ref.kind === 'tableau' && depth === 0 && getPile(state, ref).length > 0;
}

export function autoMoveFor(state: GameState, from: PileRef, depth: number): Move | null {
  if (depth !== 0) return null;
  const to: PileRef = { kind: 'waste', index: 0 };
  return canMove(state, from, to, 1) ? { type: 'move', from, to, count: 1 } : null;
}

export function findHint(state: GameState): Move | null {
  for (let i = 0; i < state.tableau.length; i++) {
    const from: PileRef = { kind: 'tableau', index: i };
    const move = autoMoveFor(state, from, 0);
    if (move) return move;
  }
  if (canDraw(state)) return { type: 'draw' };
  return null; // stock empty and nothing plays: the game is over
}

export const golfRules: Ruleset = {
  id: 'golf',
  name: 'Golf',
  tableauCount: 7,
  foundationCount: 0,
  cellCount: 0,
  hasStock: true,
  hasWaste: true,
  wasteDrop: true,
  variants: [],
  defaultVariant: 0,
  deal: (seed) => deal(seed),
  canMove,
  applyMove,
  canDraw,
  canRecycle: () => false,
  canPickRun,
  autoMoveFor,
  findHint,
  nextAutoCompleteMove: () => null,
  isWon,
  isTriviallyWinnable: () => false,
};
