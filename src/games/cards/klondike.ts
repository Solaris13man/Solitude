import { type Card, isRed, shuffledDeck } from './deck';
import {
  type GameState,
  type Move,
  type PileKind,
  type PileRef,
  type Ruleset,
  getPile,
  top,
} from './types';

export type DrawMode = 1 | 3;

export function deal(seed: number, drawMode: number): GameState {
  const deck = shuffledDeck(seed);
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < 7; col++) {
    const pile: Card[] = [];
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[cursor++]! };
      card.faceUp = row === col;
      pile.push(card);
    }
    tableau.push(pile);
  }
  const stock = deck.slice(cursor).map((c) => ({ ...c, faceUp: false }));
  return {
    game: 'klondike',
    seed,
    variant: drawMode === 3 ? 3 : 1,
    stock,
    waste: [],
    cells: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

/** Can `card` be placed on top of `target` within a tableau pile? */
export function fitsOnTableau(card: Card, target: Card | undefined): boolean {
  if (!target) return card.rank === 13;
  if (!target.faceUp) return false;
  return isRed(card.suit) !== isRed(target.suit) && card.rank === target.rank - 1;
}

/** Can `card` go on foundation pile `pile`? */
export function fitsOnFoundation(card: Card, pile: Card[]): boolean {
  const t = top(pile);
  if (!t) return card.rank === 1;
  return t.suit === card.suit && card.rank === t.rank + 1;
}

export function canMove(state: GameState, from: PileRef, to: PileRef, count: number): boolean {
  if (from.kind === 'stock' || to.kind === 'stock' || to.kind === 'waste' || to.kind === 'cell') return false;
  if (from.kind === to.kind && from.index === to.index) return false;
  const source = getPile(state, from);
  if (count < 1 || count > source.length) return false;
  if (from.kind !== 'tableau' && count !== 1) return false;
  const moving = source.slice(source.length - count);
  if (moving.some((c) => !c.faceUp)) return false;
  const lead = moving[0]!;
  if (to.kind === 'foundation') {
    if (count !== 1) return false;
    return fitsOnFoundation(lead, getPile(state, to));
  }
  return fitsOnTableau(lead, top(getPile(state, to)));
}

export function canDraw(state: GameState): boolean {
  return state.stock.length > 0;
}

export function canRecycle(state: GameState): boolean {
  return state.stock.length === 0 && state.waste.length > 0;
}

/**
 * Apply a move, mutating the state. Throws on illegal moves — callers gate
 * on canMove/canDraw/canRecycle. Flipping an exposed tableau card happens
 * automatically as part of the move.
 */
export function applyMove(state: GameState, move: Move): void {
  switch (move.type) {
    case 'draw': {
      if (!canDraw(state)) throw new Error('illegal draw');
      const n = Math.min(state.variant, state.stock.length);
      for (let i = 0; i < n; i++) {
        const card = state.stock.pop()!;
        card.faceUp = true;
        state.waste.push(card);
      }
      state.moves++;
      return;
    }
    case 'recycle': {
      if (!canRecycle(state)) throw new Error('illegal recycle');
      while (state.waste.length) {
        const card = state.waste.pop()!;
        card.faceUp = false;
        state.stock.push(card);
      }
      state.recycles++;
      state.moves++;
      // Standard scoring docks repeated passes through the deck.
      if (state.variant === 1 || state.recycles > 3) {
        state.score = Math.max(0, state.score - 100);
      }
      return;
    }
    case 'move': {
      if (!canMove(state, move.from, move.to, move.count)) throw new Error('illegal move');
      const source = getPile(state, move.from);
      const target = getPile(state, move.to);
      target.push(...source.splice(source.length - move.count, move.count));
      state.score += scoreFor(move.from.kind, move.to.kind);
      if (move.from.kind === 'tableau') {
        const exposed = top(source);
        if (exposed && !exposed.faceUp) {
          exposed.faceUp = true;
          state.score += 5;
        }
      }
      state.moves++;
      return;
    }
  }
}

function scoreFor(from: PileKind, to: PileKind): number {
  if (to === 'foundation') return 10;
  if (from === 'waste' && to === 'tableau') return 5;
  if (from === 'foundation' && to === 'tableau') return -15;
  return 0;
}

export function isWon(state: GameState): boolean {
  return state.foundations.length > 0 && state.foundations.every((p) => p.length === 13);
}

/**
 * Trivially winnable (auto-complete may take over) when the stock and waste
 * are empty and every tableau card is face up.
 */
export function isTriviallyWinnable(state: GameState): boolean {
  if (isWon(state)) return false;
  if (state.stock.length > 0 || state.waste.length > 0) return false;
  return state.tableau.every((pile) => pile.every((c) => c.faceUp));
}

/** Find the foundation pile a given top card could move to right now, if any. */
export function foundationTargetFor(state: GameState, from: PileRef): PileRef | null {
  const card = top(getPile(state, from));
  if (!card || !card.faceUp) return null;
  for (let i = 0; i < state.foundations.length; i++) {
    if (fitsOnFoundation(card, state.foundations[i]!)) {
      return { kind: 'foundation', index: i };
    }
  }
  return null;
}

export function canPickRun(state: GameState, ref: PileRef, depth: number): boolean {
  if (ref.kind === 'stock' || ref.kind === 'cell') return false;
  const pile = getPile(state, ref);
  if (pile.length === 0 || depth >= pile.length) return false;
  if (ref.kind !== 'tableau') return depth === 0;
  return pile[pile.length - 1 - depth]!.faceUp;
}

/**
 * Best automatic destination for a tap on the card `depth` cards from the
 * top of `from`. Prefers foundation, then a tableau move.
 */
export function autoMoveFor(state: GameState, from: PileRef, depth: number): Move | null {
  const count = depth + 1;
  if (count === 1) {
    const f = foundationTargetFor(state, from);
    if (f) return { type: 'move', from, to: f, count: 1 };
  }
  // Prefer non-empty tableau targets; only park kings on empty columns.
  const candidates: PileRef[] = [];
  for (let i = 0; i < state.tableau.length; i++) {
    const to: PileRef = { kind: 'tableau', index: i };
    if (canMove(state, from, to, count)) candidates.push(to);
  }
  if (candidates.length === 0) return null;
  const nonEmpty = candidates.find((c) => getPile(state, c).length > 0);
  return { type: 'move', from, to: nonEmpty ?? candidates[0]!, count };
}

/**
 * Suggest one legal, useful move. Priority: waste→foundation,
 * tableau→foundation, a revealing tableau→tableau move, waste→tableau,
 * then draw/recycle. Pointless king shuffles between empty columns are
 * skipped so the hint never loops.
 */
export function findHint(state: GameState): Move | null {
  const waste: PileRef = { kind: 'waste', index: 0 };

  if (state.waste.length > 0) {
    const f = foundationTargetFor(state, waste);
    if (f) return { type: 'move', from: waste, to: f, count: 1 };
  }

  for (let i = 0; i < state.tableau.length; i++) {
    const from: PileRef = { kind: 'tableau', index: i };
    const f = foundationTargetFor(state, from);
    if (f) return { type: 'move', from, to: f, count: 1 };
  }

  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i]!;
    const firstFaceUp = pile.findIndex((c) => c.faceUp);
    if (firstFaceUp === -1) continue;
    const count = pile.length - firstFaceUp;
    const lead = pile[firstFaceUp]!;
    const reveals = firstFaceUp > 0;
    if (!reveals && lead.rank === 13) continue;
    for (let j = 0; j < state.tableau.length; j++) {
      if (j === i) continue;
      const to: PileRef = { kind: 'tableau', index: j };
      if (lead.rank === 13 && state.tableau[j]!.length === 0 && !reveals) continue;
      if (canMove(state, { kind: 'tableau', index: i }, to, count)) {
        return { type: 'move', from: { kind: 'tableau', index: i }, to, count };
      }
    }
  }

  if (state.waste.length > 0) {
    for (let j = 0; j < state.tableau.length; j++) {
      const to: PileRef = { kind: 'tableau', index: j };
      if (canMove(state, waste, to, 1)) {
        return { type: 'move', from: waste, to, count: 1 };
      }
    }
  }

  if (canDraw(state)) return { type: 'draw' };
  if (canRecycle(state)) return { type: 'recycle' };
  return null;
}

/**
 * When trivially winnable, the win is reached by repeatedly sending the
 * lowest playable top card to its foundation.
 */
export function nextAutoCompleteMove(state: GameState): Move | null {
  if (isWon(state) || !isTriviallyWinnable(state)) return null;
  let best: { move: Move; rank: number } | null = null;
  for (let i = 0; i < state.tableau.length; i++) {
    const from: PileRef = { kind: 'tableau', index: i };
    const card = top(state.tableau[i]!);
    if (!card) continue;
    const to = foundationTargetFor(state, from);
    if (to && (!best || card.rank < best.rank)) {
      best = { move: { type: 'move', from, to, count: 1 }, rank: card.rank };
    }
  }
  return best?.move ?? null;
}

export const klondikeRules: Ruleset = {
  id: 'klondike',
  name: 'Klondike',
  tableauCount: 7,
  foundationCount: 4,
  cellCount: 0,
  hasStock: true,
  hasWaste: true,
  variants: [
    { value: 1, label: 'Draw 1' },
    { value: 3, label: 'Draw 3' },
  ],
  defaultVariant: 1,
  deal,
  canMove,
  applyMove,
  canDraw,
  canRecycle,
  canPickRun,
  autoMoveFor,
  findHint,
  nextAutoCompleteMove,
  isWon,
  isTriviallyWinnable,
};
