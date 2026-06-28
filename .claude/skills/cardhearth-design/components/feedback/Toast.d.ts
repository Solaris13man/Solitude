import * as React from 'react';

export interface ToastProps {
  icon?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** The small dark status pill for announcer messages and badge unlocks. */
export function Toast(props: ToastProps): JSX.Element;
