import * as React from 'react';
import type { Rank, Suit } from './PlayingCard';

export interface FanCard {
  rank?: Rank;
  suit?: Suit;
  faceDown?: boolean;
}

/**
 * A hand of cards held in an arc — overlapping, rotated around a low pivot.
 * Hovered/selected cards lift. Built on PlayingCard.
 * @startingPoint section="Cards" subtitle="A hand of cards fanned in an arc" viewport="520x260"
 */
export interface CardFanProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  cards: FanCard[];
  /** Card width in px (scales the whole fan). */
  width?: number;
  /** Degrees of rotation between adjacent cards. */
  spread?: number;
  /** Fraction of each card hidden behind the next (0–1). */
  overlap?: number;
  /** Render every card face-down (an opponent's hand). */
  faceDown?: boolean;
  selectedIndex?: number;
  onSelect?: (index: number, card: FanCard) => void;
  style?: React.CSSProperties;
}

/** A hand of cards held in an arc, built on PlayingCard. */
export function CardFan(props: CardFanProps): JSX.Element;
