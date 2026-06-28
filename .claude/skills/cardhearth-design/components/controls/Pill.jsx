import React from 'react';

/**
 * Pill — the round-cornered chip used for game-nav links and the homepage
 * "feature pills". Glass on felt; the active nav state fills with gold.
 */
export function Pill({
  active = false,
  as = 'span',
  href,
  size = 'md',
  onClick,
  children,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { padding: '0.18rem 0.6rem', fontSize: 'var(--text-xs)' },
    md: { padding: '0.35rem 0.8rem', fontSize: 'var(--text-sm)' },
    lg: { padding: '0.4rem 1rem', fontSize: 'var(--text-sm)' },
  };
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    textDecoration: 'none',
    cursor: href || onClick ? 'pointer' : 'default',
    transition: 'background-color 0.15s ease',
    ...sizes[size],
    background: active ? 'var(--gold)' : 'var(--on-felt-glass)',
    border: `1px solid ${active ? 'var(--gold)' : 'var(--on-felt-line)'}`,
    color: active ? 'var(--gold-ink)' : 'var(--chrome-text)',
    ...style,
  };
  const Tag = href ? 'a' : as;
  return (
    <Tag href={href} onClick={onClick} style={base} {...rest}>
      {children}
    </Tag>
  );
}
