import React from 'react';

/**
 * EmptyState — a calm, centred placeholder for "nothing here yet": no games
 * match a filter, a paused board, an empty stats history. An icon/illustration
 * (children), a title, a line of guidance, and an optional action. Translucent
 * so it sits on the felt.
 */
export function EmptyState({
  icon = null,
  title,
  message,
  action = null,
  style = {},
  ...rest
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      gap: '0.6rem', maxWidth: '24rem', margin: '0 auto',
      padding: '2rem 1.5rem',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--on-felt-fill-soft)',
      border: '1px solid var(--on-felt-line-soft)',
      color: 'var(--chrome-text)',
      ...style,
    }} {...rest}>
      {icon != null && (
        <div style={{
          width: '3.2rem', height: '3.2rem', display: 'grid', placeItems: 'center',
          fontSize: '1.9rem', lineHeight: 1, opacity: 0.85,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--on-felt-glass)', border: '1px solid var(--on-felt-line)',
        }}>{icon}</div>
      )}
      {title != null && <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>{title}</div>}
      {message != null && <div style={{ fontSize: 'var(--text-sm)', opacity: 0.78, lineHeight: 1.5, textWrap: 'pretty' }}>{message}</div>}
      {action != null && <div style={{ marginTop: '0.4rem' }}>{action}</div>}
    </div>
  );
}
