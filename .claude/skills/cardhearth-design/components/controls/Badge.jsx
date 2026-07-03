import React from 'react';

/**
 * Badge — a small trust/status marker. CardHearth uses these for the
 * "✓ Every deal winnable" highlight on menu cards (tone="positive"),
 * the gold "⭐ Daily" eyebrow (tone="gold"), and streak chips (tone="streak").
 */
export function Badge({ tone = 'positive', icon, children, style = {}, ...rest }) {
  const tones = {
    positive: { color: 'var(--gold-mint)', background: 'transparent', weight: 700, pad: '0', border: 'none' },
    gold: { color: 'var(--gold)', background: 'transparent', weight: 700, pad: '0', border: 'none' },
    chip: {
      color: 'var(--chrome-text)',
      background: 'var(--on-felt-fill-strong)',
      weight: 700,
      pad: '0.18rem 0.6rem',
      border: '1px solid var(--on-felt-line)',
    },
    streak: {
      color: 'var(--gold)',
      background: 'rgb(255 217 94 / 0.14)',
      weight: 800,
      pad: '0.18rem 0.6rem',
      border: '1px solid var(--gold-veil)',
    },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-2xs)',
        fontWeight: t.weight,
        lineHeight: 1.25,
        letterSpacing: tone === 'gold' ? '0.04em' : 'normal',
        color: t.color,
        background: t.background,
        border: t.border,
        padding: t.pad,
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
