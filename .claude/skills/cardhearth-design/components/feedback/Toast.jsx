import React from 'react';

/**
 * Toast — the small dark status pill that surfaces important announcer
 * messages (e.g. "No moves there", "Badge unlocked!"). Fixed near the bottom
 * center in the app; here it renders inline so you can place it anywhere.
 */
export function Toast({ icon, children, style = {} }) {
  return (
    <div
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.55rem',
        maxWidth: 'min(26rem, 90vw)',
        padding: '0.6rem 1.1rem',
        borderRadius: 'var(--radius-md)',
        background: 'rgb(20 24 20 / 0.92)',
        color: 'var(--chrome-text)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        textAlign: 'center',
        boxShadow: 'var(--shadow-toast)',
        ...style,
      }}
    >
      {icon && <span aria-hidden="true" style={{ fontSize: '1.1em' }}>{icon}</span>}
      <span>{children}</span>
    </div>
  );
}
