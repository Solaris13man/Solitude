import React from 'react';

/**
 * Panel — the on-felt surface primitive. A translucent dark fill with a white
 * hairline (or gold-veiled) border; never an opaque block. Most CardHearth
 * chrome (trust strips, daily hero, instructions, calendars) is a Panel.
 */
export function Panel({
  tone = 'fill',
  pad = 'md',
  radius = 'lg',
  as = 'div',
  style = {},
  children,
  ...rest
}) {
  const tones = {
    fill: { background: 'var(--on-felt-fill)', border: '1px solid var(--on-felt-line)' },
    soft: { background: 'var(--on-felt-fill-soft)', border: '1px solid var(--on-felt-line-soft)' },
    gold: { background: 'var(--on-felt-fill)', border: '1px solid var(--gold-veil)' },
    glass: { background: 'var(--on-felt-glass)', border: '1px solid var(--on-felt-line)' },
  };
  const pads = { none: '0', sm: '0.7rem 0.9rem', md: '0.9rem 1.1rem', lg: '1.3rem 1.5rem' };
  const radii = {
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
  };
  const Tag = as;
  return (
    <Tag
      style={{
        borderRadius: radii[radius],
        padding: pads[pad],
        color: 'var(--chrome-text)',
        fontFamily: 'var(--font-sans)',
        ...tones[tone],
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
