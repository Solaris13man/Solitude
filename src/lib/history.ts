/**
 * Snapshot-based undo/redo, generic over any game's state shape. Each entry
 * is a deep clone, which avoids inverse-move bookkeeping bugs and stays cheap
 * for classic-game states (a few hundred small objects at most).
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private clone: (state: T) => T;

  constructor(clone: (state: T) => T) {
    this.clone = clone;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Record the state as it was *before* a move is applied. */
  push(stateBefore: T): void {
    this.past.push(this.clone(stateBefore));
    this.future = [];
  }

  /** Drop the most recent snapshot — for when a fallible apply throws after
   *  push, so Undo never "restores" to a move that never happened. */
  discardLast(): void {
    this.past.pop();
  }

  /** Returns the state to restore, or null. `current` goes onto the redo stack. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(this.clone(current));
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.clone(current));
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
