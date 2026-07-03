import * as React from 'react';

/**
 * A calm centred placeholder for "nothing here yet" — empty filters, a paused
 * board, blank stats. Icon, title, guidance, optional action; sits on the felt.
 * @startingPoint section="Feedback" subtitle="Calm placeholder for empty / paused states" viewport="520x300"
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** An emoji, glyph, or small <svg>/<img> shown in a glass disc. */
  icon?: React.ReactNode;
  title?: React.ReactNode;
  message?: React.ReactNode;
  /** A Button (or link) for the suggested next step. */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

/** A calm centred placeholder for empty / paused states. */
export function EmptyState(props: EmptyStateProps): JSX.Element;
