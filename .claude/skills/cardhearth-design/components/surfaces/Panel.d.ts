import * as React from 'react';

export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  /** "fill" (default), "soft", "gold" (gold-veiled border), or "glass". */
  tone?: 'fill' | 'soft' | 'gold' | 'glass';
  pad?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'md' | 'lg' | 'xl';
  as?: keyof JSX.IntrinsicElements;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** The on-felt surface primitive — translucent dark fill with a hairline border. */
export function Panel(props: PanelProps): JSX.Element;
