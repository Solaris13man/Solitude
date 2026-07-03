import * as React from 'react';

/**
 * Props for the felt-table button: glass by default, gold for the primary action.
 * @startingPoint section="Controls" subtitle="Glass + gold felt buttons" viewport="700x140"
 */
export interface ButtonProps extends React.HTMLAttributes<HTMLElement> {
  /** Visual style. "glass" = translucent on felt (default); "primary" = gold CTA; "ghost" = borderless. */
  variant?: 'glass' | 'primary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  /** Leading icon node (rendered in a 1rem box). */
  icon?: React.ReactNode;
  /** Trailing icon node. */
  iconRight?: React.ReactNode;
  /** Render as a link when set. */
  href?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * The felt-table button: glass by default, gold for the primary action.
 */
export function Button(props: ButtonProps): JSX.Element;
