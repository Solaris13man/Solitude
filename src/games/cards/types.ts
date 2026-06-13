import type { Card } from './deck';

export type GameId = 'klondike' | 'spider' | 'freecell' | 'golf';

export type PileKind = 'stock' | 'waste' | 'foundation' | 'tableau' | 'cell';

export interface PileRef {
  kind: PileKind;
  index: number;
}

/**
 * One state shape serves every game: a game simply leaves the piles it
 * doesn't use empty (e.g. Klondike has no cells, FreeCell no stock).
 */
export interface GameState {
  game: GameId;
  seed: number;
  /** Game-specific mode: Klondike draw count (1|3), Spider suits (1|2|4), 0 otherwise. */
  variant: number;
  stock: Card[];
  waste: Card[];
  /** Free cells; each holds at most one card. */
  cells: Card[][];
  foundations: Card[][];
  tableau: Card[][];
  moves: number;
  score: number;
  recycles: number;
}

export type Move =
  | { type: 'draw' }
  | { type: 'recycle' }
  | { type: 'move'; from: PileRef; to: PileRef; count: number };

export interface VariantOption {
  value: number;
  label: string;
}

/** Everything the generic board/controller needs to drive one game. */
export interface Ruleset {
  id: GameId;
  name: string;
  tableauCount: number;
  foundationCount: number;
  cellCount: number;
  hasStock: boolean;
  hasWaste: boolean;
  /** Selectable modes for this game (empty when there are none). */
  variants: VariantOption[];
  /** Golf: the waste pile is the play/drop target. */
  wasteDrop?: boolean;
  defaultVariant: number;
  deal(seed: number, variant: number): GameState;
  canMove(state: GameState, from: PileRef, to: PileRef, count: number): boolean;
  applyMove(state: GameState, move: Move): void;
  canDraw(state: GameState): boolean;
  canRecycle(state: GameState): boolean;
  /** Can the run starting `depth` cards from the top of `ref` be picked up? */
  canPickRun(state: GameState, ref: PileRef, depth: number): boolean;
  /** Best destination for a tap on that run, or null. */
  autoMoveFor(state: GameState, from: PileRef, depth: number): Move | null;
  findHint(state: GameState): Move | null;
  /** Next move when auto-finishing, or null when not applicable / done. */
  nextAutoCompleteMove(state: GameState): Move | null;
  isWon(state: GameState): boolean;
  isTriviallyWinnable(state: GameState): boolean;
}

export function getPile(state: GameState, ref: PileRef): Card[] {
  switch (ref.kind) {
    case 'stock': return state.stock;
    case 'waste': return state.waste;
    case 'cell': return state.cells[ref.index]!;
    case 'foundation': return state.foundations[ref.index]!;
    case 'tableau': return state.tableau[ref.index]!;
  }
}

export function top(pile: Card[]): Card | undefined {
  return pile[pile.length - 1];
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    stock: state.stock.map((c) => ({ ...c })),
    waste: state.waste.map((c) => ({ ...c })),
    cells: state.cells.map((p) => p.map((c) => ({ ...c }))),
    foundations: state.foundations.map((p) => p.map((c) => ({ ...c }))),
    tableau: state.tableau.map((p) => p.map((c) => ({ ...c }))),
  };
}

export interface SerializedGame {
  v: 2;
  state: GameState;
  elapsedMs: number;
}

export function serialize(state: GameState, elapsedMs: number): string {
  const payload: SerializedGame = { v: 2, state, elapsedMs };
  return JSON.stringify(payload);
}

export function deserialize(json: string): SerializedGame | null {
  try {
    const data = JSON.parse(json) as SerializedGame;
    if (data.v !== 2 || !data.state || !Array.isArray(data.state.tableau)) return null;
    if (!Array.isArray(data.state.cells)) return null;
    return data;
  } catch {
    return null;
  }
}
