import * as React from 'react';

export interface DialogProps {
  open?: boolean;
  title?: React.ReactNode;
  onClose?: () => void;
  /** Footer action buttons (rendered right-aligned). */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  width?: string;
  style?: React.CSSProperties;
}

/** Modal sheet — a solid light panel over a dark backdrop (settings, stats, win). */
export function Dialog(props: DialogProps): JSX.Element | null;
