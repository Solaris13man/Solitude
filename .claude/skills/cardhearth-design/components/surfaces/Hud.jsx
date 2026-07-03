import React from 'react';

/**
 * Hud — the game status bar: a rounded glass pill of tabular stats
 * (Time / Moves / Score, plus an optional deal number). Pass an array of
 * { label, value } items; deal is shown muted at the end.
 */
export function Hud({ items = [], deal, style = {} }) {
  return (
    <div
      role="group"
      aria-label="Game status"
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '1.4rem',
        width: 'fit-content',
        margin: '0 auto',
        padding: '0.4rem 1.2rem',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--on-felt-fill)',
        border: '1px solid var(--on-felt-line-soft)',
        fontFamily: 'var(--font-numeric)',
        fontSize: 'var(--text-sm)',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--chrome-text)',
        ...style,
      }}
    >
      {items.map((it, i) => (
        <span key={i}>
          <span style={{ opacity: 0.8, fontWeight: 500, marginRight: '0.3rem' }}>{it.label}</span>
          {it.value}
        </span>
      ))}
      {deal != null && <span style={{ opacity: 0.8, fontWeight: 500 }}>{deal}</span>}
    </div>
  );
}
