import React from 'react';

/**
 * Dialog — CardHearth's modal sheet. Unlike the felt chrome, dialogs are a
 * solid light panel (settings, stats, the "You won!" summary) with a dark
 * backdrop. Primary action uses the green dialog button; this is a presentational
 * shell (no native <dialog> focus-trap) for mocks and prototypes.
 */
export function Dialog({ open = true, title, onClose, footer, children, width = '26rem', style = {} }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgb(0 0 0 / 0.55)',
        zIndex: 100,
        fontFamily: 'var(--font-sans)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: `min(${width}, 92vw)`,
          borderRadius: 'var(--radius-2xl)',
          padding: '1.5rem',
          background: 'var(--panel-light)',
          color: 'var(--panel-text)',
          boxShadow: 'var(--shadow-dialog)',
          ...style,
        }}
      >
        {title && <p style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-lg)', fontWeight: 700 }}>{title}</p>}
        {children}
        {footer && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
