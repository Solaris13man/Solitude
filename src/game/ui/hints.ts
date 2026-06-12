import {
  type GameState,
  type Move,
  type PileRef,
  canDraw,
  canMove,
  canRecycle,
  foundationTargetFor,
} from '../engine/klondike';

/**
 * Suggest one legal, useful move. Priority order:
 *  1. waste → foundation
 *  2. tableau → foundation
 *  3. tableau → tableau move that flips a face-down card or frees a column
 *  4. waste → tableau
 *  5. draw (or recycle)
 * Pointless shuffles (e.g. moving a king that already sits on an empty base
 * to another empty column) are skipped so the hint never loops.
 */
export function findHint(state: GameState): Move | null {
  const waste: PileRef = { kind: 'waste', index: 0 };

  if (state.waste.length > 0) {
    const f = foundationTargetFor(state, waste);
    if (f) return { type: 'move', from: waste, to: f, count: 1 };
  }

  for (let i = 0; i < 7; i++) {
    const from: PileRef = { kind: 'tableau', index: i };
    const f = foundationTargetFor(state, from);
    if (f) return { type: 'move', from, to: f, count: 1 };
  }

  // Tableau runs that uncover a face-down card (or move a king off a
  // face-down stack onto an empty column).
  for (let i = 0; i < 7; i++) {
    const pile = state.tableau[i]!;
    const firstFaceUp = pile.findIndex((c) => c.faceUp);
    if (firstFaceUp === -1) continue;
    const count = pile.length - firstFaceUp;
    const lead = pile[firstFaceUp]!;
    // Moving the whole face-up run reveals something only if cards lie below,
    // unless the run leads with a non-king (frees the column for a king).
    const reveals = firstFaceUp > 0;
    if (!reveals && lead.rank === 13) continue;
    for (let j = 0; j < 7; j++) {
      if (j === i) continue;
      const to: PileRef = { kind: 'tableau', index: j };
      if (lead.rank === 13 && state.tableau[j]!.length === 0 && !reveals) continue;
      if (canMove(state, { kind: 'tableau', index: i }, to, count)) {
        return { type: 'move', from: { kind: 'tableau', index: i }, to, count };
      }
    }
  }

  if (state.waste.length > 0) {
    for (let j = 0; j < 7; j++) {
      const to: PileRef = { kind: 'tableau', index: j };
      if (canMove(state, waste, to, 1)) {
        return { type: 'move', from: waste, to, count: 1 };
      }
    }
  }

  if (canDraw(state)) return { type: 'draw' };
  if (canRecycle(state)) return { type: 'recycle' };
  return null;
}
