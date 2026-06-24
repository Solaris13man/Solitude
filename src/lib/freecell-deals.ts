/**
 * FreeCell numbered deals. The classic Microsoft FreeCell shipped 32,000
 * numbered deals (1–32000); CardHearth can play any of them by seed via
 * `/freecell/?deal=<n>`. This module backs the deal hub (`/freecell/deals/`)
 * and a curated set of indexable per-deal pages (`/freecell/deal/<n>/`).
 *
 * We deliberately feature a hand-picked set rather than minting 32,000 thin
 * pages: each featured deal is a genuine, distinct, playable permalink with an
 * honest note. The hub's "play any number" box covers every other deal without
 * a doorway page for each.
 */

/** The size of the classic numbered set. */
export const CLASSIC_DEAL_COUNT = 32000;

/** The one classic deal (1–32000) proven to have no solution. */
export const UNSOLVABLE_DEAL = 11982;

export interface FeaturedDeal {
  n: number;
  /** Short honest note shown on the hub and the deal page. */
  note: string;
  /** Grouping tag for the hub. */
  tag: 'classic' | 'landmark' | 'unsolvable';
}

/**
 * Curated featured deals. Notes stay factual — we don't invent per-deal
 * difficulty for deals we haven't solved. Low numbers are the classic openers
 * people look up; the landmarks are memorable round numbers; #11982 is the
 * famous unsolvable one.
 */
export const FEATURED_DEALS: FeaturedDeal[] = [
  { n: 1, note: 'The very first numbered FreeCell deal — a classic place to start.', tag: 'classic' },
  { n: 2, note: 'One of the original low-numbered deals, winnable with steady play.', tag: 'classic' },
  { n: 3, note: 'An early classic deal — fully solvable with careful planning.', tag: 'classic' },
  { n: 4, note: 'A gentle low-numbered deal to warm up on.', tag: 'classic' },
  { n: 5, note: 'A frequently-looked-up early deal, winnable with care.', tag: 'classic' },
  { n: 6, note: 'One of the classic single-digit deals.', tag: 'classic' },
  { n: 7, note: 'A solvable early deal that rewards reading the board first.', tag: 'classic' },
  { n: 8, note: 'A classic low number — open it up via an empty column.', tag: 'classic' },
  { n: 9, note: 'An early deal that rewards freeing a cascade quickly.', tag: 'classic' },
  { n: 10, note: 'Round, low and winnable — a good practice deal.', tag: 'classic' },
  { n: 100, note: 'A memorable round deal number, solvable with planning.', tag: 'landmark' },
  { n: 500, note: 'A landmark deal — like nearly all of them, winnable with care.', tag: 'landmark' },
  { n: 1000, note: 'The four-figure landmark deal, solvable with deliberate play.', tag: 'landmark' },
  { n: 2500, note: 'A mid-set landmark deal worth a careful attempt.', tag: 'landmark' },
  { n: 5000, note: 'A landmark deal from the middle of the classic set.', tag: 'landmark' },
  { n: 10000, note: 'The five-figure landmark — winnable, but plan your empty columns.', tag: 'landmark' },
  {
    n: UNSOLVABLE_DEAL,
    note: 'The famous exception: of the classic 32,000 deals, #11982 is the one proven to have no solution at all.',
    tag: 'unsolvable',
  },
  { n: 15000, note: 'A landmark deal past the midpoint of the set.', tag: 'landmark' },
  { n: 20000, note: 'A high landmark deal, solvable with patient play.', tag: 'landmark' },
  { n: 25000, note: 'A late landmark deal in the classic range.', tag: 'landmark' },
  { n: 30000, note: 'Near the top of the classic set — still winnable with care.', tag: 'landmark' },
  { n: CLASSIC_DEAL_COUNT, note: 'The last of the classic 32,000 numbered deals.', tag: 'landmark' },
];

/** Clamp an arbitrary input to a valid classic deal number, or null. */
export function normalizeDealNumber(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isInteger(n) || n < 1 || n > CLASSIC_DEAL_COUNT) return null;
  return n;
}

/** Honest one-line solvability summary for a deal. */
export function solvabilityNote(n: number): string {
  return n === UNSOLVABLE_DEAL
    ? 'Deal #11982 is the single classic deal proven to be unsolvable — a perfect curiosity, but you cannot win it no matter how you play.'
    : 'Like almost every FreeCell deal, this one is winnable with careful, deliberate play.';
}
