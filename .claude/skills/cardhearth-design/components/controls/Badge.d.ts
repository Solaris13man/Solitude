import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** "positive" = mint ✓ highlight; "gold" = eyebrow; "chip" = dark pill; "streak" = gold streak pill. */
  tone?: 'positive' | 'gold' | 'chip' | 'streak';
  icon?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Small trust/status marker: winnability highlights, eyebrows, streak chips. */
export function Badge(props: BadgeProps): JSX.Element;
