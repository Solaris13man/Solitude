import { type Card, type Suit, createSpiderDeck, shuffle } from './deck';
import {
  type GameState,
  type Move,
  type PileKind,
  type PileRef,
  type Ruleset,
  getPile,
  top,
} from './types';

const ALL_SUITS: Suit[] = ['S', 'H', 'D', 'C'];

/** A shuffled 104-card double deck (two copies of each card). */
function doubleDeck(seed: number): Card[] {
  return shuffle(createSpiderDeck(ALL_SUITS), seed);
}

export function deal(seed: number): GameState {
  const deck = doubleDeck(seed);
  const tableau: Card[][] = Array.from({ length: 10 }, () => []);
  let cursor = 0;
  // 10 columns, 4 cards each, all face up (40 cards).
  for (let col = 0; col < 10; col++) {
    for (let row = 0; row < 4; row++) {
      tableau[col]!.push({ ...deck[cursor++]!, faceUp: true });
    }
  }
  // The remaining 64 cards form the face-down stock.
  const stock = deck.slice(cursor).map((c) => ({ ...c, faceUp: false }));
  return {
    game: 'fortythieves',
    seed,
    variant: 0,
    stock,
    waste: [],
    cells: [],
    foundations: [[], [], [], [], [], [], [], []],
    tableau,
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

/**
 * Can `card` be placed on top of `target` within a tableau column? Forty
 * Thieves builds DOWN IN SUIT (a 9♠ only on a 10♠). An empty column accepts
 * any single card.
 */
export function fitsOnTableau(card: Card, target: Card | undefined): boolean {
  if (!target) return true;
  if (!target.faceUp) return false;
  return card.suit === target.suit && card.rank === target.rank - 1;
}

/** Can `card` go on foundation pile `pile`? Up A→K by suit. */
export function fitsOnFoundation(card: Card, pile: Card[]): boolean {
  const t = top(pile);
  if (!t) return card.rank === 1;
  return t.suit === card.suit && card.rank === t.rank + 1;
}

export function canMove(state: GameState, from: PileRef, to: PileRef, count: number): boolean {
  // Single-card moves only; stock and foundation are never sources.
  if (count !== 1) return false;
  if (from.kind === 'stock' || from.kind === 'foundation' || from.kind === 'cell') return false;
  if (to.kind === 'stock' || to.kind === 'waste' || to.kind === 'cell') return false;
  if (from.kind === to.kind && from.index === to.index) return false;
  const source = getPile(state, from);
  if (source.length < 1) return false;
  const card = top(source)!;
  if (!card.faceUp) return false;
  if (to.kind === 'foundation') {
    return fitsOnFoundation(card, getPile(state, to));
  }
  return fitsOnTableau(card, top(getPile(state, to)));
}

export function canDraw(state: GameState): boolean {
  return state.stock.length > 0;
}

/** No recycle in Forty Thieves: once the stock is empty it stays empty. */
export function canRecycle(_state: GameState): boolean {
  return false;
}

/**
 * Apply a move, mutating the state. Throws on illegal moves — callers gate on
 * canMove/canDraw. Single-card moves only.
 */
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
    case 'recycle': {
      throw new Error('illegal recycle');
    }
    case 'move': {
      if (!canMove(state, move.from, move.to, move.count)) throw new Error('illegal move');
      const source = getPile(state, move.from);
      const target = getPile(state, move.to);
      target.push(...source.splice(source.length - move.count, move.count));
      state.score += scoreFor(move.from.kind, move.to.kind);
      state.moves++;
      return;
    }
  }
}

function scoreFor(from: PileKind, to: PileKind): number {
  if (to === 'foundation') return 10;
  if (from === 'waste' && to === 'tableau') return 5;
  return 0;
}

export function isWon(state: GameState): boolean {
  return state.foundations.length === 8 && state.foundations.every((p) => p.length === 13);
}

/**
 * Trivially winnable (auto-complete may take over) when the stock and waste
 * are empty and every tableau column is ordered descending by rank from
 * bottom to top — so the next-needed card is always exposed.
 */
export function isTriviallyWinnable(state: GameState): boolean {
  if (isWon(state)) return false;
  if (state.stock.length > 0 || state.waste.length > 0) return false;
  return state.tableau.every((pile) =>
    pile.every((card, i) => i === 0 || card.rank <= pile[i - 1]!.rank),
  );
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

/** Classic Forty Thieves: only single cards move, so only depth 0 is pickable. */
export function canPickRun(state: GameState, ref: PileRef, depth: number): boolean {
  if (ref.kind === 'stock' || ref.kind === 'cell' || ref.kind === 'foundation') return false;
  const pile = getPile(state, ref);
  if (pile.length === 0 || depth >= pile.length) return false;
  return depth === 0;
}

/**
 * Best automatic destination for a tap on a top card (depth must be 0).
 * Prefers foundation, then a tableau move.
 */
export function autoMoveFor(state: GameState, from: PileRef, depth: number): Move | null {
  if (depth !== 0) return null;
  if (!canPickRun(state, from, 0)) return null;
  const f = foundationTargetFor(state, from);
  if (f) return { type: 'move', from, to: f, count: 1 };
  // Prefer non-empty tableau targets; only park on empty columns as a fallback.
  const candidates: PileRef[] = [];
  for (let i = 0; i < state.tableau.length; i++) {
    const to: PileRef = { kind: 'tableau', index: i };
    if (canMove(state, from, to, 1)) candidates.push(to);
  }
  if (candidates.length === 0) return null;
  const nonEmpty = candidates.find((c) => getPile(state, c).length > 0);
  return { type: 'move', from, to: nonEmpty ?? candidates[0]!, count: 1 };
}

/**
 * Suggest one legal, useful move. Priority: waste/tableau→foundation, a
 * tableau→tableau build, waste→tableau, then a draw if a stock/waste card is
 * playable. Single-card only throughout.
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

  // A tableau → tableau build (only onto a card, never just shuffling onto an
  // empty column for no gain).
  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i]!;
    if (pile.length === 0) continue;
    const from: PileRef = { kind: 'tableau', index: i };
    for (let j = 0; j < state.tableau.length; j++) {
      if (j === i) continue;
      if (state.tableau[j]!.length === 0) continue;
      const to: PileRef = { kind: 'tableau', index: j };
      if (canMove(state, from, to, 1)) return { type: 'move', from, to, count: 1 };
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

  // Only suggest drawing if some stock/waste card could actually be played.
  if (canDraw(state)) {
    const cycling = [...state.stock, ...state.waste];
    const useful = cycling.some((c) => {
      const up = { ...c, faceUp: true };
      if (state.foundations.some((f) => fitsOnFoundation(up, f))) return true;
      return state.tableau.some((p) => fitsOnTableau(up, top(p)));
    });
    if (useful) return { type: 'draw' };
  }
  return null;
}

/**
 * When trivially winnable, the win is reached by repeatedly sending the
 * lowest exposed top card to its foundation.
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

export const fortyThievesRules: Ruleset = {
  id: 'fortythieves',
  name: 'Forty Thieves',
  tableauCount: 10,
  foundationCount: 8,
  cellCount: 0,
  hasStock: true,
  hasWaste: true,
  variants: [],
  defaultVariant: 0,
  deal: (seed) => deal(seed),
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
