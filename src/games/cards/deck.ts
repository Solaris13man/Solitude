import { mulberry32 } from './rng';

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

/** 1 = Ace … 13 = King */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  /** Stable unique id, e.g. "S1" for the ace of spades. */
  id: string;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

export function cardId(suit: Suit, rank: Rank): string {
  return `${suit}${rank}`;
}

/** A fresh 52-card deck in fixed order (face down). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1 as Rank; rank <= 13; rank++) {
      deck.push({ id: cardId(suit, rank as Rank), suit, rank: rank as Rank, faceUp: false });
    }
  }
  return deck;
}

/** Fisher–Yates shuffle of any card list driven by the seeded PRNG. */
export function shuffle(cards: Card[], seed: number): Card[] {
  const deck = cards.slice();
  const rng = mulberry32(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/** A shuffled standard 52-card deck. */
export function shuffledDeck(seed: number): Card[] {
  return shuffle(createDeck(), seed);
}

/**
 * A multi-deck pack for Spider: 104 cards built from `suits`, repeated to
 * fill 8 suit-sets. Ids get a copy suffix so they stay unique.
 */
export function createSpiderDeck(suits: Suit[]): Card[] {
  const copies = 8 / suits.length;
  const deck: Card[] = [];
  for (let copy = 0; copy < copies; copy++) {
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({
          id: `${suit}${rank}-${copy}`,
          suit,
          rank: rank as Rank,
          faceUp: false,
        });
      }
    }
  }
  return deck;
}

export const RANK_LABELS: Record<Rank, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  S: '♠', H: '♥', D: '♦', C: '♣',
};

export const SUIT_NAMES: Record<Suit, string> = {
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
};

export const RANK_NAMES: Record<Rank, string> = {
  1: 'ace', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven',
  8: 'eight', 9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king',
};

export function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;
}
