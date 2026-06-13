import { shuffledDeck } from '../cards/deck';
import {
  type PeaksRules,
  type PeaksState,
  type TapResult,
  type Target,
} from './types';

/**
 * TriPeaks: 28 cards form three peaks; the bottom row starts face up. Play
 * any exposed card one rank above or below the waste top — Aces and Kings
 * wrap. Drawing from the stock resets your streak. Clear all three peaks.
 */

interface Slot {
  x: number;
  y: number;
  row: number;
}

const SLOTS: Slot[] = [];
// peaks (row 0)
for (const x of [1.5, 4.5, 7.5]) SLOTS.push({ x, y: 0, row: 0 });
// row 1: two cards under each peak
for (const x of [1, 2, 4, 5, 7, 8]) SLOTS.push({ x, y: 0.55, row: 1 });
// row 2: nine cards
for (let i = 0; i < 9; i++) SLOTS.push({ x: 0.5 + i, y: 1.1, row: 2 });
// row 3: ten cards, fully face up
for (let i = 0; i < 10; i++) SLOTS.push({ x: i, y: 1.65, row: 3 });

/** Cells in the next row that cover this one (overlap by half a card). */
function coveredBy(index: number): number[] {
  const slot = SLOTS[index]!;
  const out: number[] = [];
  SLOTS.forEach((s, i) => {
    if (s.row === slot.row + 1 && Math.abs(s.x - slot.x) <= 0.5) out.push(i);
  });
  return out;
}

export function deal(seed: number): PeaksState {
  const deck = shuffledDeck(seed);
  const cells = SLOTS.map((slot, i) => ({
    card: { ...deck[i]!, faceUp: slot.row === 3 },
    removed: false,
  }));
  const waste = [{ ...deck[28]!, faceUp: true }];
  const stock = deck.slice(29).map((c) => ({ ...c, faceUp: false }));
  return {
    game: 'tripeaks',
    seed,
    variant: 0,
    cells,
    stock,
    waste,
    moves: 0,
    score: 0,
    recycles: 0,
    streak: 0,
  };
}

function unblocked(state: PeaksState, index: number): boolean {
  const cell = state.cells[index];
  if (!cell || cell.removed) return false;
  return coveredBy(index).every((c) => state.cells[c]!.removed);
}

/** Flip any newly unblocked cards face up. */
function refreshFaces(state: PeaksState): void {
  for (let i = 0; i < state.cells.length; i++) {
    if (unblocked(state, i)) state.cells[i]!.card.faceUp = true;
  }
}

export function isExposed(state: PeaksState, index: number): boolean {
  return unblocked(state, index) && state.cells[index]!.card.faceUp;
}

function wrapAdjacent(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || diff === 12; // Ace and King wrap
}

export function tap(state: PeaksState, target: Target, _selected: Target | null): TapResult {
  if (target.kind !== 'cell' || !isExposed(state, target.index)) return 'invalid';
  const card = state.cells[target.index]!.card;
  const base = state.waste[state.waste.length - 1];
  if (!base || !wrapAdjacent(card.rank, base.rank)) return 'invalid';
  state.cells[target.index]!.removed = true;
  state.waste.push(card);
  state.streak++;
  state.score += state.streak * 10;
  state.moves++;
  refreshFaces(state);
  return 'applied';
}

export function canDraw(state: PeaksState): boolean {
  return state.stock.length > 0;
}

export function draw(state: PeaksState): void {
  if (!canDraw(state)) throw new Error('illegal draw');
  const card = state.stock.pop()!;
  card.faceUp = true;
  state.waste.push(card);
  state.streak = 0;
  state.moves++;
}

export function isWon(state: PeaksState): boolean {
  return state.cells.every((c) => c.removed);
}

export function hint(state: PeaksState): Target[] | 'draw' | 'recycle' | null {
  const base = state.waste[state.waste.length - 1];
  if (base) {
    for (let i = 0; i < state.cells.length; i++) {
      if (isExposed(state, i) && wrapAdjacent(state.cells[i]!.card.rank, base.rank)) {
        return [{ kind: 'cell', index: i }];
      }
    }
  }
  if (canDraw(state)) return 'draw';
  return null;
}

export const tripeaksRules: PeaksRules = {
  id: 'tripeaks',
  name: 'TriPeaks',
  layout: SLOTS.map(({ x, y }) => ({ x, y })),
  layoutWidth: 10,
  layoutHeight: 1.65 + 1,
  pairing: false,
  deal,
  isExposed,
  tap,
  canDraw,
  canRecycle: () => false,
  draw,
  recycle: () => {
    throw new Error('tripeaks has no recycle');
  },
  isWon,
  hint,
};
