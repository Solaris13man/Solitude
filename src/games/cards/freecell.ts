import { type Card, isRed, shuffledDeck } from './deck';
import {
  type GameState,
  type Move,
  type PileRef,
  type Ruleset,
  getPile,
  top,
} from './types';

export function deal(seed: number): GameState {
  const deck = shuffledDeck(seed);
  const tableau: Card[][] = Array.from({ length: 8 }, () => []);
  deck.forEach((card, i) => {
    tableau[i % 8]!.push({ ...card, faceUp: true });
  });
  return {
    game: 'freecell',
    seed,
    variant: 0,
    stock: [],
    waste: [],
    cells: [[], [], [], []],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    score: 0,
    recycles: 0,
  };
}

function fitsOnCascade(card: Card, target: Card | undefined): boolean {
  if (!target) return true; // any card may go to an empty cascade
  return isRed(card.suit) !== isRed(target.suit) && card.rank === target.rank - 1;
}

export function fitsOnFoundation(card: Card, pile: Card[]): boolean {
  const t = top(pile);
  if (!t) return card.rank === 1;
  return t.suit === card.suit && card.rank === t.rank + 1;
}

/**
 * Supermove capacity: (empty cells + 1) × 2^(empty cascades). Moving *to* an
 * empty cascade can't count that cascade as a relay.
 */
export function moveCapacity(state: GameState, excludeTableau: number | null): number {
  const freeCells = state.cells.filter((c) => c.length === 0).length;
  let emptyCols = 0;
  state.tableau.forEach((p, i) => {
    if (p.length === 0 && i !== excludeTableau) emptyCols++;
  });
  return (freeCells + 1) * 2 ** emptyCols;
}

/** Is the suffix starting `depth` from the top a valid alternating run? */
export function canPickRun(state: GameState, ref: PileRef, depth: number): boolean {
  const pile = getPile(state, ref);
  if (pile.length === 0 || depth >= pile.length) return false;
  // Besides cascades, only cell cards can be picked up; foundation cards
  // stay put ("worrying back" isn't allowed in standard FreeCell).
  if (ref.kind !== 'tableau') return depth === 0 && ref.kind === 'cell';
  const start = pile.length - 1 - depth;
  for (let i = start + 1; i < pile.length; i++) {
    if (!fitsOnCascade(pile[i]!, pile[i - 1])) return false;
  }
  return depth + 1 <= moveCapacity(state, null);
}

export function canMove(state: GameState, from: PileRef, to: PileRef, count: number): boolean {
  if (from.kind === 'stock' || from.kind === 'waste' || from.kind === 'foundation') return false;
  if (to.kind === 'stock' || to.kind === 'waste') return false;
  if (from.kind === to.kind && from.index === to.index) return false;
  const source = getPile(state, from);
  if (count < 1 || count > source.length) return false;
  if (from.kind !== 'tableau' && count !== 1) return false;
  const moving = source.slice(source.length - count);
  const lead = moving[0]!;
  if (to.kind === 'cell') {
    return count === 1 && getPile(state, to).length === 0;
  }
  if (to.kind === 'foundation') {
    return count === 1 && fitsOnFoundation(lead, getPile(state, to));
  }
  // tableau target: run must be valid and within supermove capacity
  for (let i = 1; i < moving.length; i++) {
    if (!fitsOnCascade(moving[i]!, moving[i - 1])) return false;
  }
  const target = getPile(state, to);
  if (count > moveCapacity(state, target.length === 0 ? to.index : null)) return false;
  return fitsOnCascade(lead, top(target));
}

export function applyMove(state: GameState, move: Move): void {
  if (move.type !== 'move') throw new Error('freecell has no stock');
  if (!canMove(state, move.from, move.to, move.count)) throw new Error('illegal move');
  const source = getPile(state, move.from);
  const target = getPile(state, move.to);
  target.push(...source.splice(source.length - move.count, move.count));
  if (move.to.kind === 'foundation') state.score += 10;
  state.moves++;
}

export function isWon(state: GameState): boolean {
  return state.foundations.every((p) => p.length === 13);
}

/**
 * Auto-finish is safe once every cascade is ordered by descending rank from
 * bottom to top: the lowest card needed is then always exposed (anything on
 * top of it is lower-ranked and goes to a foundation first), and cells are
 * always accessible.
 */
export function isTriviallyWinnable(state: GameState): boolean {
  if (isWon(state)) return false;
  return state.tableau.every((pile) =>
    pile.every((card, i) => i === 0 || card.rank <= pile[i - 1]!.rank),
  );
}

function foundationTargetFor(state: GameState, from: PileRef): PileRef | null {
  const card = top(getPile(state, from));
  if (!card) return null;
  for (let i = 0; i < 4; i++) {
    if (fitsOnFoundation(card, state.foundations[i]!)) return { kind: 'foundation', index: i };
  }
  return null;
}

export function nextAutoCompleteMove(state: GameState): Move | null {
  if (isWon(state) || !isTriviallyWinnable(state)) return null;
  let best: { move: Move; rank: number } | null = null;
  const sources: PileRef[] = [
    ...state.tableau.map((_, i) => ({ kind: 'tableau', index: i }) as PileRef),
    ...state.cells.map((_, i) => ({ kind: 'cell', index: i }) as PileRef),
  ];
  for (const from of sources) {
    const card = top(getPile(state, from));
    if (!card) continue;
    const to = foundationTargetFor(state, from);
    if (to && (!best || card.rank < best.rank)) {
      best = { move: { type: 'move', from, to, count: 1 }, rank: card.rank };
    }
  }
  return best?.move ?? null;
}

/** Tap: foundation first, then a cascade, then (single cards) a free cell. */
export function autoMoveFor(state: GameState, from: PileRef, depth: number): Move | null {
  const count = depth + 1;
  if (!canPickRun(state, from, depth)) return null;
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
  if (count === 1 && from.kind === 'tableau') {
    for (let i = 0; i < state.cells.length; i++) {
      const to: PileRef = { kind: 'cell', index: i };
      if (canMove(state, from, to, 1)) return { type: 'move', from, to, count: 1 };
    }
  }
  return null;
}

/**
 * Hint priority: foundation plays, cascade builds (preferring runs and moves
 * out of cells), then a cell drop as a last resort.
 */
export function findHint(state: GameState): Move | null {
  const sources: PileRef[] = [
    ...state.cells.map((_, i) => ({ kind: 'cell', index: i }) as PileRef),
    ...state.tableau.map((_, i) => ({ kind: 'tableau', index: i }) as PileRef),
  ];
  for (const from of sources) {
    const to = foundationTargetFor(state, from);
    if (to) return { type: 'move', from, to, count: 1 };
  }
  // Cascade moves: prefer ones that land on a card (building) over empties.
  for (const landOnCard of [true, false]) {
    for (const from of sources) {
      const pile = getPile(state, from);
      const maxDepth = from.kind === 'tableau' ? pile.length - 1 : 0;
      for (let depth = maxDepth; depth >= 0; depth--) {
        if (!canPickRun(state, from, depth)) continue;
        const count = depth + 1;
        // A run that already continues a legal build gains nothing by moving
        // sideways — skipping it prevents the hint from ping-ponging.
        if (from.kind === 'tableau' && count < pile.length) {
          const lead = pile[pile.length - count]!;
          const beneath = pile[pile.length - count - 1]!;
          if (fitsOnCascade(lead, beneath)) continue;
        }
        for (let j = 0; j < state.tableau.length; j++) {
          const to: PileRef = { kind: 'tableau', index: j };
          const targetEmpty = state.tableau[j]!.length === 0;
          if (targetEmpty === landOnCard) continue;
          if (from.kind === 'tableau' && targetEmpty && count === pile.length) continue;
          if (canMove(state, from, to, count)) return { type: 'move', from, to, count };
        }
      }
    }
  }
  for (let i = 0; i < state.tableau.length; i++) {
    const from: PileRef = { kind: 'tableau', index: i };
    for (let j = 0; j < state.cells.length; j++) {
      const to: PileRef = { kind: 'cell', index: j };
      if (canMove(state, from, to, 1)) return { type: 'move', from, to, count: 1 };
    }
  }
  return null;
}

export const freecellRules: Ruleset = {
  id: 'freecell',
  name: 'FreeCell',
  tableauCount: 8,
  foundationCount: 4,
  cellCount: 4,
  hasStock: false,
  hasWaste: false,
  variants: [],
  defaultVariant: 0,
  deal: (seed) => deal(seed),
  canMove,
  applyMove,
  canDraw: () => false,
  canRecycle: () => false,
  canPickRun,
  autoMoveFor,
  findHint,
  nextAutoCompleteMove,
  isWon,
  isTriviallyWinnable,
};
