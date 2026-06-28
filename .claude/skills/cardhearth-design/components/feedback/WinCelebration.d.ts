import * as React from 'react';

/**
 * The CardHearth win moment — a warm gold "hearth" glow with slow radiating
 * rays behind a trophy, headline, optional stats, and actions. Confetti-free
 * and reduced-motion safe. Use standalone on the felt or inside a Dialog.
 * @startingPoint section="Feedback" subtitle="The gold hearth-glow win moment" viewport="460x420"
 */
export interface WinCelebrationProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Emoji/glyph/<svg> shown above the title. Default 🏆. */
  badge?: React.ReactNode;
  /** Readout under the title, e.g. time / moves / streak. */
  stats?: { label: React.ReactNode; value: React.ReactNode }[];
  /** Action buttons (New deal, Share, Close). */
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

/** The CardHearth gold hearth-glow win moment. */
export function WinCelebration(props: WinCelebrationProps): JSX.Element;
