import {
  type GameState,
  type Move,
  type PileRef,
  foundationTargetFor,
  isTriviallyWinnable,
  isWon,
} from './klondike';

/**
 * When the game is trivially winnable (stock/waste empty, everything face up),
 * the win can always be reached by repeatedly sending the lowest playable top
 * card to its foundation. Returns the next such move, or null when done /
 * not applicable.
 */
export function nextAutoCompleteMove(state: GameState): Move | null {
  if (isWon(state)) return null;
  if (!isTriviallyWinnable(state)) return null;
  let best: { move: Move; rank: number } | null = null;
  for (let i = 0; i < 7; i++) {
    const from: PileRef = { kind: 'tableau', index: i };
    const pile = state.tableau[i]!;
    const card = pile[pile.length - 1];
    if (!card) continue;
    const to = foundationTargetFor(state, from);
    if (to && (!best || card.rank < best.rank)) {
      best = { move: { type: 'move', from, to, count: 1 }, rank: card.rank };
    }
  }
  return best?.move ?? null;
}
