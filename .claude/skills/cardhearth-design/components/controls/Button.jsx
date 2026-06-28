import React from 'react';

/**
 * CardHearth Button — the felt-table control.
 * Default is "glass" (translucent white on felt); "primary" is the gold CTA.
 * Renders as <button> or, with href, as <a>. Icon sits before the label.
 */
export function Button({
  variant = 'glass',
  size = 'md',
  icon = null,
  iconRight = null,
  href,
  disabled = false,
  type = 'button',
  onClick,
  children,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { padding: '0.35rem 0.7rem', fontSize: '0.8rem', minHeight: '2.25rem' },
    md: { padding: '0.45rem 0.8rem', fontSize: 'var(--text-sm)', minHeight: '2.5rem' },
    lg: { padding: '0.7rem 1.4rem', fontSize: 'var(--text-md)', minHeight: '2.9rem' },
  };

  const variants = {
    glass: {
      background: 'var(--on-felt-glass)',
      border: '1px solid var(--on-felt-line)',
      color: 'var(--chrome-text)',
    },
    primary: {
      background: 'var(--gold)',
      border: '1px solid var(--gold)',
      color: 'var(--gold-ink)',
    },
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: 'var(--chrome-text)',
    },
  };

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.35rem',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.15s ease, transform 0.12s ease, filter 0.12s ease',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    ...sizes[size],
    ...variants[variant],
    ...style,
  };

  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  // Respect an explicit background override (e.g. the green dialog button)
  // instead of forcing the variant's hover color onto it.
  if (!disabled && hover && style.background == null) {
    base.background = variant === 'primary' ? 'var(--gold-soft)' : 'var(--on-felt-glass-hover)';
  } else if (!disabled && hover && style.background != null) {
    base.filter = 'brightness(1.08)';
  }
  if (!disabled && active) base.transform = 'scale(0.98)';

  const iconWrap = (node) =>
    node ? (
      <span style={{ display: 'inline-flex', width: '1rem', height: '1rem', flex: 'none' }}>{node}</span>
    ) : null;

  const content = (
    <>
      {iconWrap(icon)}
      {children != null && <span>{children}</span>}
      {iconWrap(iconRight)}
    </>
  );

  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => { setHover(false); setActive(false); },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
  };

  if (href && !disabled) {
    return (
      <a href={href} style={base} onClick={onClick} {...handlers} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} disabled={disabled} style={base} onClick={onClick} {...handlers} {...rest}>
      {content}
    </button>
  );
}
