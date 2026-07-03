import { type Card, shuffledDeck } from './deck';
import {
  type GameState,
  type Move,
  type PileRef,
  type Ruleset,
  getPile,
  top,
} from './types';

export function deal(seed: number, _variant: number): GameState {
  const deck = shuffledDeck(seed);
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < 7; col++) {
    const pile: Card[] = [];
    for (let row = 0; row < 7; row++) {
      const card = { ...deck[cursor++]! };
      // Columns 0..3: bottom three cards (indices 0,1,2) are face down.
      // Columns 4..6: every card is face up.
      card.faceUp = !(col < 4 && row < 3);
      pile.push(card);
    }
    tableau.push(pile);
  }
  // The remaining 3 cards form the stock, face down.
  const stock = deck.slice(cursor).map((c) => ({ ...c, faceUp: false }));
  return {
    game: 'scorpion',
    seed,
    variant: 0,
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

/**
 * In Scorpion you may pick up any face-up card together with everything on
 * top of it, regardless of order. So the only requirement is that the card at
 * `depth` from the top is face up.
 */
export function canPickRun(state: GameState, ref: PileRef, depth: number): boolean {
  if (ref.kind !== 'tableau') return false;
  const pile = getPile(state, ref);
  if (pile.length === 0 || depth >= pile.length) return false;
  return pile[pile.length - 1 - depth]!.faceUp;
}

export function canMove(state: GameState, from: PileRef, to: PileRef, count: number): boolean {
  if (from.kind !== 'tableau' || to.kind !== 'tableau') return false;
  if (from.index === to.index) return false;
  const source = getPile(state, from);
  if (count < 1 || count > source.length) return false;
  if (!canPickRun(state, from, count - 1)) return false;
  const moving = source.slice(source.length - count);
  if (moving.some((c) => !c.faceUp)) return false;
  const lead = moving[0]!; // deepest picked card
  const target = top(getPile(state, to));
  if (!target) return lead.rank === 13; // empty column accepts only a King
  // Build down in suit: the lead must be the same suit and exactly one rank
  // below the target's top card.
  return target.faceUp && target.suit === lead.suit && target.rank === lead.rank + 1;
}

export function canDraw(state: GameState): boolean {
  // Scorpion's deal puts one card on each of the first three columns; it does
  // not require those columns to be non-empty.
  return state.stock.length > 0;
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
  const slot = state.foundations.find((f) => f.length === 0);
  if (!slot) {
    // Unreachable with the shipped pile counts — but a corrupted save must
    // fail loudly rather than silently vanish 13 cards (and still score).
    throw new Error('No empty foundation slot for a completed run');
  }
  const run = pile.splice(start, 13).reverse(); // king ends up on top
  slot.push(...run);
  state.score += 100;
  const exposed = top(pile);
  if (exposed) exposed.faceUp = true;
  return true;
}

export function applyMove(state: GameState, move: Move): void {
  switch (move.type) {
    case 'draw': {
      if (!canDraw(state)) throw new Error('illegal draw');
      for (let i = 0; i < 3 && state.stock.length > 0; i++) {
        const card = state.stock.pop()!;
        card.faceUp = true;
        state.tableau[i]!.push(card);
      }
      state.moves++;
      for (let i = 0; i < state.tableau.length; i++) sweepCompletedRun(state, i);
      return;
    }
    case 'recycle':
      throw new Error('scorpion has no recycle');
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
  return state.foundations.filter((f) => f.length === 13).length === 4;
}

/**
 * Best destination for a tapped group: a same-suit continuation first, then an
 * empty column (which only accepts a King lead).
 */
export function autoMoveFor(state: GameState, from: PileRef, depth: number): Move | null {
  const count = depth + 1;
  if (!canPickRun(state, from, depth)) return null;
  const source = getPile(state, from);
  const lead = source[source.length - count]!;
  let sameSuit: PileRef | null = null;
  let empty: PileRef | null = null;
  for (let i = 0; i < state.tableau.length; i++) {
    if (i === from.index) continue;
    const to: PileRef = { kind: 'tableau', index: i };
    if (!canMove(state, from, to, count)) continue;
    const target = top(state.tableau[i]!);
    if (!target) empty ??= to;
    else if (target.suit === lead.suit) sameSuit ??= to;
  }
  const to = sameSuit ?? empty;
  return to ? { type: 'move', from, to, count } : null;
}

/**
 * Hint priority: a same-suit join, then a move that flips a face-down card,
 * then a stock deal. Pointless shuffles (a run already correctly built, or an
 * empty-column move that reveals nothing) are skipped so the hint never loops.
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
    for (let depth = 0; depth < pile.length; depth++) {
      if (!canPickRun(state, { kind: 'tableau', index: i }, depth)) break;
      const count = depth + 1;
      const lead = pile[pile.length - count]!;
      const beneath = pile[pile.length - count - 1];
      const reveals = !!beneath && !beneath.faceUp;
      // The lead already correctly continues a same-suit build: any lateral
      // move is a regression, so never suggest one.
      const onSameSuitBuild =
        !!beneath && beneath.faceUp && beneath.suit === lead.suit && beneath.rank === lead.rank + 1;
      if (onSameSuitBuild) continue;
      for (let j = 0; j < state.tableau.length; j++) {
        if (j === i) continue;
        const from: PileRef = { kind: 'tableau', index: i };
        const to: PileRef = { kind: 'tableau', index: j };
        if (!canMove(state, from, to, count)) continue;
        const target = top(state.tableau[j]!);
        if (!target && !reveals) continue; // pointless shuffle to empty
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
    candidates.find((c) => c.reveals);
  if (pick) return pick.move;
  if (canDraw(state)) return { type: 'draw' };
  return null;
}

export const scorpionRules: Ruleset = {
  id: 'scorpion',
  name: 'Scorpion',
  tableauCount: 7,
  foundationCount: 4,
  cellCount: 0,
  hasStock: true,
  hasWaste: false,
  variants: [],
  defaultVariant: 0,
  deal,
  canMove,
  applyMove,
  canDraw,
  canRecycle,
  canPickRun,
  autoMoveFor,
  findHint,
  // Scorpion completes runs automatically as they form, like Spider.
  nextAutoCompleteMove: () => null,
  isWon,
  isTriviallyWinnable: () => false,
};
