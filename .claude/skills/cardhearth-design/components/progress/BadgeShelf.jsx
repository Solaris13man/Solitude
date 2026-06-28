import React from 'react';

/**
 * BadgeShelf — a compact achievements teaser. A label + summary on the left,
 * a row of badge chips on the right (earned ones glow gold, locked ones are
 * grayed), and a gold arrow. Renders as a link when `href` is given so it can
 * pull players toward the full collection.
 */
export function BadgeShelf({
  label = 'Achievements',
  summary,
  badges = [],
  href,
  style = {},
  ...rest
}) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag
      href={href}
      aria-label={label + (summary ? ' — ' + summary : '')}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.9rem',
        padding: '0.8rem 1rem', borderRadius: 'var(--radius-lg)',
        textDecoration: 'none', color: 'var(--chrome-text)',
        fontFamily: 'var(--font-sans)',
        background: 'var(--on-felt-fill)', border: '1px solid var(--gold-veil)',
        ...style,
      }}
      {...rest}
    >
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6 }}>{label}</span>
        {summary && <span style={{ fontWeight: 800 }}>{summary}</span>}
      </span>
      <span style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }} aria-hidden="true">
        {badges.map((b, i) => (
          <span key={i} title={b.name}
            style={{
              width: '2rem', height: '2rem', borderRadius: '999px',
              display: 'grid', placeItems: 'center', fontSize: '1rem', flex: 'none',
              background: b.earned ? 'rgb(255 217 94 / 0.16)' : 'rgb(255 255 255 / 0.05)',
              border: `1px solid ${b.earned ? 'var(--gold-veil)' : 'var(--on-felt-line-soft)'}`,
              filter: b.earned ? 'none' : 'grayscale(1)',
              opacity: b.earned ? 1 : 0.5,
            }}>{b.icon}</span>
        ))}
      </span>
      {href && <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--gold)', flex: 'none' }}>→</span>}
    </Tag>
  );
}
