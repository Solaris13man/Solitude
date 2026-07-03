import * as React from 'react';

export interface BadgeChip {
  /** Glyph shown in the chip (emoji or single character). */
  icon: React.ReactNode;
  /** Accessible/title name, e.g. "5-day streak". */
  name?: string;
  /** Earned chips glow gold; locked chips are grayed. */
  earned?: boolean;
}

/**
 * A compact achievements teaser — label, summary, and a row of badge chips that pull toward the full collection.
 * @startingPoint section="Progress" subtitle="Achievements teaser shelf" viewport="700x120"
 */
export interface BadgeShelfProps extends React.HTMLAttributes<HTMLElement> {
  /** Uppercase eyebrow label. Default "Achievements". */
  label?: string;
  /** Bold line under the label, e.g. "3 of 24 unlocked". */
  summary?: string;
  badges?: BadgeChip[];
  /** When set, the shelf becomes a link with a trailing gold arrow. */
  href?: string;
  style?: React.CSSProperties;
}

/** A compact achievements teaser — label, summary, and a row of badge chips. */
export function BadgeShelf(props: BadgeShelfProps): JSX.Element;
