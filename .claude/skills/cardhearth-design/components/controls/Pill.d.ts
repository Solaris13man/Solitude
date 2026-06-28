import * as React from 'react';

export interface PillProps extends React.HTMLAttributes<HTMLElement> {
  /** Active nav state — fills with gold. */
  active?: boolean;
  as?: keyof JSX.IntrinsicElements;
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Round-cornered chip for game-nav links and homepage feature pills. */
export function Pill(props: PillProps): JSX.Element;
