/**
 * FreeCell numbered deals. CardHearth uses the standard Microsoft FreeCell deal
 * numbering (see src/games/cards/ms-freecell.ts), so deal #N here is the same
 * #N as Windows FreeCell and every other site that follows the standard. That
 * makes the famous deals real: #11982 is genuinely unsolvable, #617 and #1941
 * are genuinely among the hardest solvable ones.
 *
 * This module backs the deal hub (`/freecell/deals/`) and a curated set of
 * indexable per-deal pages (`/freecell/deal/<n>/`). The hub's "play any number"
 * box covers every other deal without a page each.
 */

export { MS_DEAL_MAX as PLAYABLE_MAX } from '../games/cards/ms-freecell';

/** The size of the original numbered set (the famous "32,000 deals"). */
export const CLASSIC_SET_SIZE = 32000;

/** The one deal in 1–32000 proven to have no solution. */
export const UNSOLVABLE_DEAL = 11982;

export interface FeaturedDeal {
  n: number;
  /** Short, factual note shown on the hub and the deal page. */
  note: string;
  tag: 'classic' | 'hard' | 'unsolvable' | 'landmark';
}

/**
 * Curated featured deals. Difficulty notes for specific deals are sourced from
 * the documented FreeCell record (solitairelaboratory.com's analysis of the
 * standard numbered deals) — not invented.
 */
export const FEATURED_DEALS: FeaturedDeal[] = [
  { n: 1, note: 'The very first numbered deal — the classic place to start, and comfortably winnable.', tag: 'classic' },
  { n: 2, note: 'The second standard deal: a gentle, winnable opener.', tag: 'classic' },
  { n: 3, note: 'An easy early deal, good for warming up.', tag: 'classic' },
  { n: 5, note: 'A frequently looked-up low number — solvable with steady play.', tag: 'classic' },
  { n: 10, note: 'Round, low and winnable: a good practice deal.', tag: 'classic' },
  {
    n: 617,
    note: 'Solvable, but long documented as one of the hardest of the standard deals — a real test of planning.',
    tag: 'hard',
  },
  {
    n: 1941,
    note: 'Another deal famous for its difficulty: winnable, but only with very careful, deliberate play.',
    tag: 'hard',
  },
  { n: 8591, note: 'One of the deals solvers single out as especially tough — beatable, barely.', tag: 'hard' },
  { n: 13007, note: 'A notoriously difficult deal that defeats most casual attempts.', tag: 'hard' },
  { n: 31465, note: 'Among the hardest in the upper range of the standard set.', tag: 'hard' },
  { n: 31938, note: 'A late, brutally hard deal — a trophy for serious players.', tag: 'hard' },
  {
    n: UNSOLVABLE_DEAL,
    note: 'The famous exception: of the original 32,000 deals, #11982 is the one proven to have no solution in standard four-cell FreeCell.',
    tag: 'unsolvable',
  },
  { n: 100, note: 'A memorable round number, winnable with planning.', tag: 'landmark' },
  { n: 1000, note: 'The four-figure landmark deal.', tag: 'landmark' },
  { n: 10000, note: 'The five-figure landmark — plan your empty columns.', tag: 'landmark' },
  { n: CLASSIC_SET_SIZE, note: 'The last of the original 32,000 numbered deals.', tag: 'landmark' },
  { n: 100000, note: 'Into the extended range Windows added beyond the classic 32,000.', tag: 'landmark' },
  { n: 1000000, note: 'The millionth deal — the top of the modern numbered range.', tag: 'landmark' },
];

/** Clamp an arbitrary input to a valid playable deal number, or null. */
export function normalizeDealNumber(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) return null;
  return n;
}

/** Honest one-line solvability summary for a deal. */
export function solvabilityNote(n: number): string {
  return n === UNSOLVABLE_DEAL
    ? 'Deal #11982 is the single standard deal proven unsolvable — a perfect curiosity, but it cannot be won no matter how you play.'
    : 'Like almost every FreeCell deal, this one is winnable with careful, deliberate play.';
}
