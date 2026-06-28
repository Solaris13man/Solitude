import * as React from 'react';

/**
 * A tile in the games menu — felt art well, name, tagline, highlight, "Play now →".
 * @startingPoint section="Surfaces" subtitle="Games-menu tile with art well" viewport="700x320"
 */
export interface GameCardProps extends React.HTMLAttributes<HTMLAnchorElement> {
  name: string;
  tagline?: string;
  /** Winnability/trust line shown as a mint ✓ badge. */
  highlight?: string;
  href?: string;
  /** Artwork for the felt "art well" (an <svg> scene or <img>). */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** A tile in the games menu — felt art well, name, tagline, highlight, "Play now →". */
export function GameCard(props: GameCardProps): JSX.Element;
