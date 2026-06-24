import { type Card, type Suit, createSpiderDeck, shuffle } from './deck';
import { friendlyDealSeed } from './rng';
import {
  type GameState,
  type Move,
  type PileRef,
  type Ruleset,
  getPile,
  top,
} from './types';

const SUIT_SETS: Record<number, Suit[]> = {
  1: ['S'],
  2: ['S', 'H'],
  4: ['S', 'H', 'D', 'C'],
};

export function deal(seed: number, suits: number): GameState {
  const variant = suits === 2 || suits === 4 ? suits : 1;
  const deck = shuffle(createSpiderDeck(SUIT_SETS[variant]!), seed);
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < 10; col++) {
    const size = col < 4 ? 6 : 5;
    const pile: Card[] = [];
    for (let row = 0; row < size; row++) {
      const card = { ...deck[cursor++]! };
      card.faceUp = row === size - 1;
      pile.push(card);
    }
    tableau.push(pile);
  }
  const stock = deck.slice(cursor).map((c) => ({ ...c, faceUp: false }));
  return {
    game: 'spider',
    seed,
    variant,
    stock,
    waste: [],
    cells: [],
    foundations: [[], [], [], [], [], [], [], []],
    tableau,
    moves: 0,
    score: 500, // standard Spider scoring: 500 - 1/move + 100/completed run
    recycles: 0,
  };
}

/** Is the suffix starting `depth` from the top a movable same-suit run? */
export function canPickRun(state: GameState, ref: PileRef, depth: number): boolean {
  if (ref.kind !== 'tableau') return false;
  const pile = getPile(state, ref);
  if (pile.length === 0 || depth >= pile.length) return false;
  const start = pile.length - 1 - depth;
  for (let i = start; i < pile.length; i++) {
    const card = pile[i]!;
    if (!card.faceUp) return false;
    if (i > start) {
      const above = pile[i - 1]!;
      if (card.suit !== above.suit || card.rank !== above.rank - 1) return false;
    }
  }
  return true;
}

export function canMove(state: GameState, from: PileRef, to: PileRef, count: number): boolean {
  if (from.kind !== 'tableau' || to.kind !== 'tableau') return false;
  if (from.index === to.index) return false;
  const source = getPile(state, from);
  if (count < 1 || count > source.length) return false;
  if (!canPickRun(state, from, count - 1)) return false;
  const lead = source[source.length - count]!;
  const target = top(getPile(state, to));
  if (!target) return true; // any run may move to an empty pile
  return target.faceUp && target.rank === lead.rank + 1;
}

export function canDraw(state: GameState): boolean {
  // A stock deal requires every tableau pile to be occupied.
  return state.stock.length > 0 && state.tableau.every((p) => p.length > 0);
}

export function canRecycle(): boolean {
  return false;
}

/** After cards land on a pile, sweep a completed K→A same-suit run off it. */
function sweepCompletedRun(state: GameState, pileIndex: number): boolean {
  const pile = state.tableau[pileIndex]!;
  if (pile.length < 13) return false;
  const start = pile.length - 13;
  const lead = pile[start]!;
  if (!lead.faceUp || lead.rank !== 13) return false;
  for (let i = start; i < pile.length; i++) {
    const card = pile[i]!;
    if (!card.faceUp || card.suit !== lead.suit || card.rank !== 13 - (i - start)) return false;
  }
  const run = pile.splice(start, 13).reverse(); // king ends up on top
  const slot = state.foundations.find((f) => f.length === 0);
  if (slot) slot.push(...run);
  state.score += 100;
  const exposed = top(pile);
  if (exposed) exposed.faceUp = true;
  return true;
}

export function applyMove(state: GameState, move: Move): void {
  switch (move.type) {
    case 'draw': {
      if (!canDraw(state)) throw new Error('illegal draw');
      for (let i = 0; i < state.tableau.length && state.stock.length > 0; i++) {
        const card = state.stock.pop()!;
        card.faceUp = true;
        state.tableau[i]!.push(card);
      }
      state.moves++;
      state.score--;
      for (let i = 0; i < state.tableau.length; i++) sweepCompletedRun(state, i);
      return;
    }
    case 'recycle':
      throw new Error('spider has no recycle');
    case 'move': {
      if (!canMove(state, move.from, move.to, move.count)) throw new Error('illegal move');
      const source = getPile(state, move.from);
      const target = getPile(state, move.to);
      target.push(...source.splice(source.length - move.count, move.count));
      const exposed = top(source);
      if (exposed && !exposed.faceUp) exposed.faceUp = true;
      state.moves++;
      state.score--;
      sweepCompletedRun(state, move.to.index);
      return;
    }
  }
}

export function isWon(state: GameState): boolean {
  return state.foundations.filter((f) => f.length === 13).length === 8;
}

/**
 * Best destination for a tapped run: a same-suit continuation first (it
 * grows a movable run), then any rank+1 target, then an empty pile.
 */
export function autoMoveFor(state: GameState, from: PileRef, depth: number): Move | null {
  const count = depth + 1;
  if (!canPickRun(state, from, depth)) return null;
  const source = getPile(state, from);
  const lead = source[source.length - count]!;
  let sameSuit: PileRef | null = null;
  let anySuit: PileRef | null = null;
  let empty: PileRef | null = null;
  for (let i = 0; i < state.tableau.length; i++) {
    if (i === from.index) continue;
    const to: PileRef = { kind: 'tableau', index: i };
    if (!canMove(state, from, to, count)) continue;
    const target = top(state.tableau[i]!);
    if (!target) empty ??= to;
    else if (target.suit === lead.suit) sameSuit ??= to;
    else anySuit ??= to;
  }
  const to = sameSuit ?? anySuit ?? empty;
  return to ? { type: 'move', from, to, count } : null;
}

/**
 * Hint priority: a same-suit join (extends a movable run), then a move that
 * flips a face-down card, then any onto-a-card move, then an empty-pile move
 * that reveals something, then a stock deal.
 */
export function findHint(state: GameState): Move | null {
  interface Candidate {
    move: Move;
    sameSuit: boolean;
    reveals: boolean;
    toEmpty: boolean;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i]!;
    // Consider every pickable run head in the pile.
    for (let depth = 0; depth < pile.length; depth++) {
      if (!canPickRun(state, { kind: 'tableau', index: i }, depth)) break;
      const count = depth + 1;
      const lead = pile[pile.length - count]!;
      const beneath = pile[pile.length - count - 1];
      // Revealing means an actual face-down flip, not just "something below".
      const reveals = !!beneath && !beneath.faceUp;
      // The run already continues a same-suit build: any lateral move is a
      // regression, so never suggest one (prevents hint ping-pong).
      const onSameSuitBuild =
        !!beneath && beneath.faceUp && beneath.suit === lead.suit && beneath.rank === lead.rank + 1;
      if (onSameSuitBuild) continue;
      const onAnyBuild = !!beneath && beneath.faceUp && beneath.rank === lead.rank + 1;
      for (let j = 0; j < state.tableau.length; j++) {
        if (j === i) continue;
        const from: PileRef = { kind: 'tableau', index: i };
        const to: PileRef = { kind: 'tableau', index: j };
        if (!canMove(state, from, to, count)) continue;
        const target = top(state.tableau[j]!);
        if (!target && !reveals) continue; // pointless shuffle to empty
        // Already on an off-suit build: only a same-suit landing improves it.
        if (onAnyBuild && (!target || target.suit !== lead.suit)) continue;
        candidates.push({
          move: { type: 'move', from, to, count },
          sameSuit: !!target && target.suit === lead.suit,
          reveals,
          toEmpty: !target,
        });
      }
    }
  }
  const pick =
    candidates.find((c) => c.sameSuit && c.reveals) ??
    candidates.find((c) => c.sameSuit) ??
    candidates.find((c) => c.reveals && !c.toEmpty) ??
    candidates.find((c) => !c.toEmpty) ??
    candidates.find((c) => c.reveals);
  if (pick) return pick.move;
  if (canDraw(state)) return { type: 'draw' };
  return null;
}

export const spiderRules: Ruleset = {
  id: 'spider',
  name: 'Spider',
  tableauCount: 10,
  foundationCount: 8,
  cellCount: 0,
  hasStock: true,
  hasWaste: false,
  variants: [
    { value: 1, label: '1 suit' },
    { value: 2, label: '2 suits' },
    { value: 4, label: '4 suits' },
  ],
  defaultVariant: 1,
  randomSeed: friendlyDealSeed,
  deal,
  canMove,
  applyMove,
  canDraw,
  canRecycle,
  canPickRun,
  autoMoveFor,
  findHint,
  // Spider completes runs automatically as they form; there is no separate
  // auto-finish phase.
  nextAutoCompleteMove: () => null,
  isWon,
  isTriviallyWinnable: () => false,
};
