import { type Card, type Rank, type Suit, cardId } from './deck';

/**
 * The classic Microsoft FreeCell deal numbering. Reproduces the exact Windows
 * shuffle for a given game number, so deal #N here is the same #N people know
 * from Windows FreeCell and every other site that follows the standard (e.g.
 * the famously unsolvable #11982).
 *
 * The generator is the Microsoft C-runtime LCG; cards are indexed 0–51 as
 * rank×4 + suit, with rank order A,2,…,K and suit order Clubs, Diamonds,
 * Hearts, Spades. Verified byte-for-byte against the published layouts for
 * games #1 and #617 (see ms-freecell.test.ts).
 */

// MS suit order: 0=Clubs, 1=Diamonds, 2=Hearts, 3=Spades.
const MS_SUITS: Suit[] = ['C', 'D', 'H', 'S'];

function cardFromMsIndex(v: number): Card {
  const rank = (Math.floor(v / 4) + 1) as Rank; // 0 = Ace → rank 1
  const suit = MS_SUITS[v % 4]!;
  return { id: cardId(suit, rank), suit, rank, faceUp: false };
}

/**
 * The 52 cards in deal order (row-major across the eight cascades, the same
 * order they come off the shuffle) for a Microsoft FreeCell game number.
 */
export function msFreecellDealOrder(gameNumber: number): Card[] {
  let state = gameNumber >>> 0;
  // Microsoft LCG: state = state·214013 + 2531011 (mod 2^31); rand = state >> 16.
  // The product stays below 2^53, so plain number arithmetic is exact.
  const rand = (): number => {
    state = (state * 214013 + 2531011) % 2147483648;
    return Math.floor(state / 65536);
  };
  const cards = Array.from({ length: 52 }, (_, i) => i);
  const order: Card[] = [];
  for (let i = 0; i < 52; i++) {
    const left = 52 - i;
    const j = rand() % left;
    order.push(cardFromMsIndex(cards[j]!));
    cards[j] = cards[left - 1]!; // move the last live card into the hole
  }
  return order;
}

/** The original numbered set everyone shares (Windows supports 1–1,000,000). */
export const MS_DEAL_MAX = 1_000_000;

/** A random valid Microsoft FreeCell game number. */
export function randomMsDeal(): number {
  return 1 + Math.floor(Math.random() * MS_DEAL_MAX);
}
