import * as React from 'react';

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

/**
 * A single rendered playing card — cream face with classic pips / framed court
 * letter / big ace, or the gold-inset gradient back. Pure CSS, no images.
 * @startingPoint section="Cards" subtitle="A rendered playing card — pips, courts, ace, back" viewport="520x300"
 */
export interface PlayingCardProps extends React.HTMLAttributes<HTMLDivElement> {
  rank?: Rank;
  suit?: Suit;
  /** Show the patterned card back instead of the face. */
  faceDown?: boolean;
  /** Card width in px; height follows the 150:210 ratio. */
  width?: number;
  /** Gold selection ring (e.g. a chosen card in a trick). */
  selected?: boolean;
  style?: React.CSSProperties;
}

/** A single rendered playing card, faithful to the CardHearth table deck. */
export function PlayingCard(props: PlayingCardProps): JSX.Element;
