import { type Card, type Suit, isRed, shuffledDeck } from './deck';

export type DrawMode = 1 | 3;

export type PileKind = 'stock' | 'waste' | 'foundation' | 'tableau';

export interface PileRef {
  kind: PileKind;
  /** Index within foundations (0–3) or tableau (0–6); 0 for stock/waste. */
  index: number;
}

export interface GameState {
  seed: number;
  drawMode: DrawMode;
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  moves: number;
  score: number;
  /** Number of times the waste has been recycled back into the stock. */
  recycles: number;
}

export type Move =
  | { type: 'draw' }
  | { type: 'recycle' }
  | { type: 'move'; from: PileRef; to: PileRef; count: number };

export function deal(seed: number, drawMode: DrawMode): GameState {
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
    seed,
    drawMode,
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    stock: state.stock.map((c) => ({ ...c })),
    waste: state.waste.map((c) => ({ ...c })),
    foundations: state.foundations.map((p) => p.map((c) => ({ ...c }))),
    tableau: state.tableau.map((p) => p.map((c) => ({ ...c }))),
  };
}

export function getPile(state: GameState, ref: PileRef): Card[] {
  switch (ref.kind) {
    case 'stock': return state.stock;
    case 'waste': return state.waste;
    case 'foundation': return state.foundations[ref.index]!;
    case 'tableau': return state.tableau[ref.index]!;
  }
}

function top(pile: Card[]): Card | undefined {
  return pile[pile.length - 1];
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

/**
 * Is moving `count` cards from the top of `from` to `to` legal?
 * Foundations only ever accept/give single cards.
 */
export function canMove(state: GameState, from: PileRef, to: PileRef, count: number): boolean {
  if (from.kind === 'stock' || to.kind === 'stock' || to.kind === 'waste') return false;
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
 * Apply a move, mutating and returning the state. Throws on illegal moves —
 * callers should gate on canMove/canDraw/canRecycle.
 * Flipping an exposed tableau card happens automatically as part of the move.
 */
export function applyMove(state: GameState, move: Move): GameState {
  switch (move.type) {
    case 'draw': {
      if (!canDraw(state)) throw new Error('illegal draw');
      const n = Math.min(state.drawMode, state.stock.length);
      for (let i = 0; i < n; i++) {
        const card = state.stock.pop()!;
        card.faceUp = true;
        state.waste.push(card);
      }
      state.moves++;
      return state;
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
      // Vegas-style penalty kept mild: standard scoring docks repeat passes.
      if (state.drawMode === 1 || state.recycles > 3) {
        state.score = Math.max(0, state.score - 100);
      }
      return state;
    }
    case 'move': {
      if (!canMove(state, move.from, move.to, move.count)) throw new Error('illegal move');
      const source = getPile(state, move.from);
      const target = getPile(state, move.to);
      const moving = source.splice(source.length - move.count, move.count);
      target.push(...moving);
      state.score += scoreFor(move.from.kind, move.to.kind);
      if (move.from.kind === 'tableau') {
        const exposed = top(source);
        if (exposed && !exposed.faceUp) {
          exposed.faceUp = true;
          state.score += 5;
        }
      }
      state.moves++;
      return state;
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
  return state.foundations.every((p) => p.length === 13);
}

/**
 * The game is trivially winnable (auto-complete may take over) when the stock
 * and waste are empty and every tableau card is face up.
 */
export function isTriviallyWinnable(state: GameState): boolean {
  if (isWon(state)) return false;
  if (state.stock.length > 0 || state.waste.length > 0) return false;
  return state.tableau.every((pile) => pile.every((c) => c.faceUp));
}

export interface FoundationTarget {
  from: PileRef;
  to: PileRef;
}

/** Find the foundation pile a given top card could move to right now, if any. */
export function foundationTargetFor(state: GameState, from: PileRef): PileRef | null {
  const source = getPile(state, from);
  const card = top(source);
  if (!card || !card.faceUp) return null;
  for (let i = 0; i < 4; i++) {
    if (fitsOnFoundation(card, state.foundations[i]!)) {
      return { kind: 'foundation', index: i };
    }
  }
  return null;
}

/**
 * Best automatic destination for a tap on the card `depth` cards from the top
 * of `from` (depth 0 = top card). Prefers foundation, then a tableau move.
 */
export function autoMoveFor(state: GameState, from: PileRef, depth: number): Move | null {
  const count = depth + 1;
  if (count === 1) {
    const f = foundationTargetFor(state, from);
    if (f) return { type: 'move', from, to: f, count: 1 };
  }
  // Prefer non-empty tableau targets; only park kings on empty columns.
  const candidates: PileRef[] = [];
  for (let i = 0; i < 7; i++) {
    const to: PileRef = { kind: 'tableau', index: i };
    if (canMove(state, from, to, count)) candidates.push(to);
  }
  if (candidates.length === 0) return null;
  const nonEmpty = candidates.find((c) => getPile(state, c).length > 0);
  return { type: 'move', from, to: nonEmpty ?? candidates[0]!, count };
}

export interface SerializedGame {
  v: 1;
  state: GameState;
  elapsedMs: number;
}

export function serialize(state: GameState, elapsedMs: number): string {
  const payload: SerializedGame = { v: 1, state, elapsedMs };
  return JSON.stringify(payload);
}

export function deserialize(json: string): SerializedGame | null {
  try {
    const data = JSON.parse(json) as SerializedGame;
    if (data.v !== 1 || !data.state || !Array.isArray(data.state.tableau)) return null;
    return data;
  } catch {
    return null;
  }
}
