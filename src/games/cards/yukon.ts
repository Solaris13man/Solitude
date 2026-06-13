import { type Card, isRed, shuffledDeck } from './deck';
import {
  type GameState,
  type Move,
  type PileRef,
  type Ruleset,
  getPile,
  top,
} from './types';

/**
 * Yukon deal (52 cards): 7 tableau columns, no stock/waste.
 * Column 0 gets a single face-up card. Columns 1..6 get (c + 5) cards each
 * (6, 7, 8, 9, 10, 11), where the bottom (size - 5) cards are face down and
 * the top 5 are face up. Total: 1 + 6 + 7 + 8 + 9 + 10 + 11 = 52.
 */
export function deal(seed: number): GameState {
  const deck = shuffledDeck(seed);
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < 7; col++) {
    const size = col === 0 ? 1 : col + 5;
    const faceDown = Math.max(0, size - 5);
    const pile: Card[] = [];
    for (let row = 0; row < size; row++) {
      const card = { ...deck[cursor++]! };
      card.faceUp = row >= faceDown;
      pile.push(card);
    }
    tableau.push(pile);
  }
  return {
    game: 'yukon',
    seed,
    variant: 0,
    stock: [],
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

/** Can `card` go on foundation pile `pile`? Build up A→K by suit. */
export function fitsOnFoundation(card: Card, pile: Card[]): boolean {
  const t = top(pile);
  if (!t) return card.rank === 1;
  return t.suit === card.suit && card.rank === t.rank + 1;
}

/**
 * Yukon canMove: only the LEAD (deepest picked) card needs to fit the target,
 * and every moving card must be face up. The moving group does NOT have to form
 * an ordered run — that is the Yukon twist.
 */
export function canMove(state: GameState, from: PileRef, to: PileRef, count: number): boolean {
  if (from.kind === 'stock' || from.kind === 'waste' || from.kind === 'cell') return false;
  if (to.kind === 'stock' || to.kind === 'waste' || to.kind === 'cell') return false;
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

export function canDraw(_state: GameState): boolean {
  return false;
}

export function canRecycle(_state: GameState): boolean {
  return false;
}

/**
 * Apply a move, mutating the state. Throws on illegal moves — callers gate on
 * canMove. Flipping an exposed face-down tableau card happens automatically.
 */
export function applyMove(state: GameState, move: Move): void {
  if (move.type !== 'move') throw new Error('yukon has no stock');
  if (!canMove(state, move.from, move.to, move.count)) throw new Error('illegal move');
  const source = getPile(state, move.from);
  const target = getPile(state, move.to);
  target.push(...source.splice(source.length - move.count, move.count));
  if (move.to.kind === 'foundation') state.score += 10;
  if (move.from.kind === 'tableau') {
    const exposed = top(source);
    if (exposed && !exposed.faceUp) {
      exposed.faceUp = true;
      state.score += 5;
    }
  }
  state.moves++;
}

export function isWon(state: GameState): boolean {
  return state.foundations.length > 0 && state.foundations.every((p) => p.length === 13);
}

/**
 * Trivially winnable (auto-complete may take over) only when every tableau
 * pile is fully face up AND ordered strictly descending by rank from bottom to
 * top, so the lowest needed card is always the exposed top.
 */
export function isTriviallyWinnable(state: GameState): boolean {
  if (isWon(state)) return false;
  return state.tableau.every((pile) =>
    pile.every((card, i) => card.faceUp && (i === 0 || card.rank < pile[i - 1]!.rank)),
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

/**
 * Yukon twist: any face-up card can be picked up with everything on top of it,
 * ordered or not. So a run is pickable iff the card at that depth is face up.
 */
export function canPickRun(state: GameState, ref: PileRef, depth: number): boolean {
  if (ref.kind !== 'tableau') return false;
  const pile = getPile(state, ref);
  if (pile.length === 0 || depth >= pile.length) return false;
  return pile[pile.length - 1 - depth]!.faceUp;
}

/**
 * Best automatic destination for a tap on the card `depth` cards from the top
 * of `from`. Single taps prefer a foundation; otherwise the picked group goes
 * to a valid tableau target, preferring non-empty columns.
 */
export function autoMoveFor(state: GameState, from: PileRef, depth: number): Move | null {
  if (!canPickRun(state, from, depth)) return null;
  const count = depth + 1;
  if (count === 1) {
    const f = foundationTargetFor(state, from);
    if (f) return { type: 'move', from, to: f, count: 1 };
  }
  let nonEmpty: PileRef | null = null;
  let empty: PileRef | null = null;
  for (let i = 0; i < state.tableau.length; i++) {
    const to: PileRef = { kind: 'tableau', index: i };
    if (!canMove(state, from, to, count)) continue;
    if (state.tableau[i]!.length > 0) nonEmpty ??= to;
    else empty ??= to;
  }
  if (nonEmpty) return { type: 'move', from, to: nonEmpty, count };
  if (empty) return { type: 'move', from, to: empty, count };
  return null;
}

/**
 * Suggest one legal, useful move. Priority: tableau→foundation, a tableau move
 * that flips a face-down card, then any building tableau move. Pointless
 * king-to-empty shuffles are skipped so the hint never loops.
 */
export function findHint(state: GameState): Move | null {
  for (let i = 0; i < state.tableau.length; i++) {
    const from: PileRef = { kind: 'tableau', index: i };
    const f = foundationTargetFor(state, from);
    if (f) return { type: 'move', from, to: f, count: 1 };
  }

  // Prefer moves that flip an exposed face-down card, then plain builds.
  for (const wantReveal of [true, false]) {
    for (let i = 0; i < state.tableau.length; i++) {
      const pile = state.tableau[i]!;
      const firstFaceUp = pile.findIndex((c) => c.faceUp);
      if (firstFaceUp === -1) continue;
      // Try each face-up card as the lead of a picked group.
      for (let lead = firstFaceUp; lead < pile.length; lead++) {
        const count = pile.length - lead;
        const reveals = lead > 0; // a face-down card sits beneath the lead
        if (reveals !== wantReveal) continue;
        const leadCard = pile[lead]!;
        for (let j = 0; j < state.tableau.length; j++) {
          if (j === i) continue;
          const to: PileRef = { kind: 'tableau', index: j };
          // Avoid pointless king-to-empty shuffles that loop.
          if (
            leadCard.rank === 13 &&
            state.tableau[j]!.length === 0 &&
            !reveals
          ) {
            continue;
          }
          const from: PileRef = { kind: 'tableau', index: i };
          if (canMove(state, from, to, count)) {
            return { type: 'move', from, to, count };
          }
        }
      }
    }
  }
  return null;
}

/**
 * When trivially winnable, the win is reached by repeatedly sending the lowest
 * exposed top card to its foundation.
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

export const yukonRules: Ruleset = {
  id: 'yukon',
  name: 'Yukon',
  tableauCount: 7,
  foundationCount: 4,
  cellCount: 0,
  hasStock: false,
  hasWaste: false,
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
