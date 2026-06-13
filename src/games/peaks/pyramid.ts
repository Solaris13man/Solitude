import { shuffledDeck } from '../cards/deck';
import {
  type PeaksRules,
  type PeaksState,
  type TapResult,
  type Target,
} from './types';

/**
 * Pyramid Solitaire: 28 cards in a seven-row pyramid, all face up. Remove
 * exposed pairs that sum to 13 (J=11, Q=12; Kings come off alone). Pair with
 * the waste top too. Two recycles of the stock (three passes total).
 */

const ROWS = 7;
const MAX_RECYCLES = 2;

/** idx(r, i) for row r (0 = apex) position i. */
const cellIndex = (r: number, i: number) => (r * (r + 1)) / 2 + i;

const LAYOUT: { x: number; y: number }[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let i = 0; i <= r; i++) {
    LAYOUT.push({ x: (ROWS - 1 - r) / 2 + i, y: r * 0.42 });
  }
}

/** The two cells covering cell (r, i), or [] on the bottom row. */
function coveredBy(index: number): number[] {
  let r = 0;
  while (cellIndex(r + 1, 0) <= index) r++;
  const i = index - cellIndex(r, 0);
  if (r === ROWS - 1) return [];
  return [cellIndex(r + 1, i), cellIndex(r + 1, i + 1)];
}

export function deal(seed: number): PeaksState {
  const deck = shuffledDeck(seed);
  const cells = deck.slice(0, 28).map((card) => ({ card: { ...card, faceUp: true }, removed: false }));
  const stock = deck.slice(28).map((c) => ({ ...c, faceUp: false }));
  return {
    game: 'pyramid',
    seed,
    variant: 0,
    cells,
    stock,
    waste: [],
    moves: 0,
    score: 0,
    recycles: 0,
    streak: 0,
  };
}

export function isExposed(state: PeaksState, index: number): boolean {
  const cell = state.cells[index];
  if (!cell || cell.removed) return false;
  return coveredBy(index).every((c) => state.cells[c]!.removed);
}

function targetRank(state: PeaksState, target: Target): number | null {
  if (target.kind === 'waste') {
    const top = state.waste[state.waste.length - 1];
    return top ? top.rank : null;
  }
  return isExposed(state, target.index) ? state.cells[target.index]!.card.rank : null;
}

function removeTarget(state: PeaksState, target: Target): void {
  if (target.kind === 'waste') state.waste.pop();
  else state.cells[target.index]!.removed = true;
}

const sameTarget = (a: Target, b: Target) =>
  a.kind === b.kind && (a.kind !== 'cell' || b.kind !== 'cell' || a.index === b.index);

export function tap(state: PeaksState, target: Target, selected: Target | null): TapResult {
  const rank = targetRank(state, target);
  if (rank === null) return 'invalid';
  if (rank === 13) {
    removeTarget(state, target);
    state.moves++;
    state.score += 5;
    return 'applied';
  }
  if (selected === null) return 'select';
  if (sameTarget(selected, target)) return 'deselect';
  const selectedRank = targetRank(state, selected);
  if (selectedRank !== null && selectedRank + rank === 13) {
    removeTarget(state, selected);
    removeTarget(state, target);
    state.moves++;
    state.score += 10;
    return 'applied';
  }
  return 'select'; // switch selection to the new card
}

export function canDraw(state: PeaksState): boolean {
  return state.stock.length > 0;
}

export function canRecycle(state: PeaksState): boolean {
  return state.stock.length === 0 && state.waste.length > 0 && state.recycles < MAX_RECYCLES;
}

export function draw(state: PeaksState): void {
  if (!canDraw(state)) throw new Error('illegal draw');
  const card = state.stock.pop()!;
  card.faceUp = true;
  state.waste.push(card);
  state.moves++;
}

export function recycle(state: PeaksState): void {
  if (!canRecycle(state)) throw new Error('illegal recycle');
  while (state.waste.length) {
    const card = state.waste.pop()!;
    card.faceUp = false;
    state.stock.push(card);
  }
  state.recycles++;
  state.moves++;
}

export function isWon(state: PeaksState): boolean {
  return state.cells.every((c) => c.removed);
}

export function hint(state: PeaksState): Target[] | 'draw' | 'recycle' | null {
  const exposed: Target[] = [];
  for (let i = 0; i < state.cells.length; i++) {
    if (isExposed(state, i)) exposed.push({ kind: 'cell', index: i });
  }
  if (state.waste.length > 0) exposed.push({ kind: 'waste' });
  for (const t of exposed) {
    if (targetRank(state, t) === 13) return [t];
  }
  for (let a = 0; a < exposed.length; a++) {
    for (let b = a + 1; b < exposed.length; b++) {
      const ra = targetRank(state, exposed[a]!);
      const rb = targetRank(state, exposed[b]!);
      if (ra !== null && rb !== null && ra + rb === 13) return [exposed[a]!, exposed[b]!];
    }
  }
  if (canDraw(state)) return 'draw';
  if (canRecycle(state)) return 'recycle';
  return null;
}

export const pyramidRules: PeaksRules = {
  id: 'pyramid',
  name: 'Pyramid',
  layout: LAYOUT,
  layoutWidth: 7,
  layoutHeight: 6 * 0.42 + 1,
  pairing: true,
  deal,
  isExposed,
  tap,
  canDraw,
  canRecycle,
  draw,
  recycle,
  isWon,
  hint,
};
