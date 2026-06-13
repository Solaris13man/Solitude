import type { Card } from '../cards/deck';

/**
 * "Peaks" games (Pyramid, TriPeaks): cards sit in a fixed overlapping
 * formation rather than piles, and play is tap-driven — no dragging.
 */

export type PeaksGameId = 'pyramid' | 'tripeaks';

export interface PeaksCell {
  card: Card;
  removed: boolean;
}

export interface PeaksState {
  game: PeaksGameId;
  seed: number;
  variant: number;
  cells: PeaksCell[];
  stock: Card[];
  waste: Card[];
  moves: number;
  score: number;
  recycles: number;
  /** Consecutive formation clears since the last draw (TriPeaks scoring). */
  streak: number;
}

export type Target = { kind: 'cell'; index: number } | { kind: 'waste' };

export type TapResult = 'applied' | 'select' | 'deselect' | 'invalid';

export interface PeaksRules {
  id: PeaksGameId;
  name: string;
  /** Cell positions: x in card widths, y in card heights. */
  layout: { x: number; y: number }[];
  layoutWidth: number;
  layoutHeight: number;
  /** Pyramid pairs two cards; TriPeaks plays single taps. */
  pairing: boolean;
  deal(seed: number): PeaksState;
  isExposed(state: PeaksState, index: number): boolean;
  /** Handle a tap; mutates state when the result is 'applied'. */
  tap(state: PeaksState, target: Target, selected: Target | null): TapResult;
  canDraw(state: PeaksState): boolean;
  canRecycle(state: PeaksState): boolean;
  draw(state: PeaksState): void;
  recycle(state: PeaksState): void;
  isWon(state: PeaksState): boolean;
  hint(state: PeaksState): Target[] | 'draw' | 'recycle' | null;
}

export function cloneState(state: PeaksState): PeaksState {
  return {
    ...state,
    cells: state.cells.map((c) => ({ ...c, card: { ...c.card } })),
    stock: state.stock.map((c) => ({ ...c })),
    waste: state.waste.map((c) => ({ ...c })),
  };
}

export interface SerializedPeaks {
  v: 1;
  state: PeaksState;
  elapsedMs: number;
}

export function serialize(state: PeaksState, elapsedMs: number): string {
  return JSON.stringify({ v: 1, state, elapsedMs } satisfies SerializedPeaks);
}

export function deserialize(json: string, game: PeaksGameId): SerializedPeaks | null {
  try {
    const data = JSON.parse(json) as SerializedPeaks;
    if (data.v !== 1 || data.state?.game !== game) return null;
    if (!Array.isArray(data.state.cells)) return null;
    return data;
  } catch {
    return null;
  }
}
