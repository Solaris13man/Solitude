import * as React from 'react';

export interface HudItem {
  label: string;
  value: React.ReactNode;
}

export interface HudProps {
  /** Stats shown left to right, e.g. [{label:'Time', value:'2:14'}]. */
  items?: HudItem[];
  /** Optional muted deal number at the end, e.g. "#1042". */
  deal?: React.ReactNode;
  style?: React.CSSProperties;
}

/** The game status bar — a glass pill of tabular Time / Moves / Score stats. */
export function Hud(props: HudProps): JSX.Element;
