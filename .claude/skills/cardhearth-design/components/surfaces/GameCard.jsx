import React from 'react';
import { Badge } from '../controls/Badge.jsx';

const REDUCE_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * GameCard — a tile in the games menu. A felt "art well" up top (pass artwork
 * as children, e.g. an <svg> or <img>), then name, tagline, an optional
 * winnability highlight, and a gold "Play now →" affordance. Lifts on hover.
 */
export function GameCard({ name, tagline, highlight, href = '#', children, style = {}, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'var(--chrome-text)',
        fontFamily: 'var(--font-sans)',
        background: 'var(--on-felt-fill)',
        border: `1px solid ${hover ? 'var(--gold-veil)' : 'var(--on-felt-line)'}`,
        boxShadow: hover ? 'var(--shadow-hover)' : 'var(--shadow-card)',
        transform: hover && !REDUCE_MOTION ? 'translateY(-4px)' : 'none',
        transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          display: 'block',
          aspectRatio: '16 / 7',
          overflow: 'hidden',
          background: 'var(--surface-thumb-bg)',
          borderBottom: '1px solid var(--on-felt-line-soft)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            padding: '6px 0',
            filter: 'drop-shadow(0 3px 4px rgb(0 0 0 / 0.42))',
            transform: hover && !REDUCE_MOTION ? 'scale(1.06)' : 'scale(1)',
            transition: 'transform 0.28s var(--ease-land, ease)',
          }}
        >
          {children}
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', padding: '0.7rem 0.9rem 0.9rem' }}>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>{name}</span>
        {tagline && <span style={{ fontSize: 'var(--text-sm)', opacity: 0.72 }}>{tagline}</span>}
        {highlight && (
          <span style={{ marginTop: '0.35rem' }}>
            <Badge tone="positive">✓ {highlight}</Badge>
          </span>
        )}
        <span style={{ marginTop: '0.4rem', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--gold)' }}>
          Play now →
        </span>
      </span>
    </a>
  );
}
