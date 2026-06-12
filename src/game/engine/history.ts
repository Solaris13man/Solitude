import { type GameState, cloneState } from './klondike';

/**
 * Snapshot-based undo/redo. A full Klondike state is 52 small objects, so
 * cloning per move is cheap and avoids inverse-move bookkeeping bugs.
 */
export class History {
  private past: GameState[] = [];
  private future: GameState[] = [];

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Record the state as it was *before* a move is applied. */
  push(stateBefore: GameState): void {
    this.past.push(cloneState(stateBefore));
    this.future = [];
  }

  /** Returns the state to restore, or null. `current` goes onto the redo stack. */
  undo(current: GameState): GameState | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(cloneState(current));
    return prev;
  }

  redo(current: GameState): GameState | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneState(current));
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
