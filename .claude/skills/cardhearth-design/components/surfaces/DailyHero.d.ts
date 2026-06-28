import * as React from 'react';

/**
 * The home page's "Today's Daily" hook as a reusable surface — gold-veiled
 * panel with eyebrow, the day's game, a status line, the play CTA, and an
 * optional stat row. The site's strongest return-driver.
 * @startingPoint section="Surfaces" subtitle="The 'Today's Daily' home-page hook" viewport="520x340"
 */
export interface DailyHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: React.ReactNode;
  /** The day's game name (the big line). */
  game: React.ReactNode;
  status?: React.ReactNode;
  /** Optional date shown after the eyebrow. */
  date?: React.ReactNode;
  href?: string;
  ctaLabel?: string;
  /** Already played today — softens the CTA to "Play again". */
  played?: boolean;
  /** Streak / best / solved figures under the button. */
  stats?: { label: React.ReactNode; value: React.ReactNode }[];
  style?: React.CSSProperties;
}

/** The "Today's Daily" home-page hook surface. */
export function DailyHero(props: DailyHeroProps): JSX.Element;
