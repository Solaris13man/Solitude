import React from 'react';
import { Button } from '../controls/Button.jsx';

/**
 * DailyHero — the home page's "Today's Daily" hook as a reusable surface. A
 * gold-veiled panel: eyebrow, the day's game name, a status line, the play
 * CTA, and an optional stat row (streak / best / solved). The strongest
 * return-driver on the site, now one component.
 */
export function DailyHero({
  eyebrow = "Today's Daily",
  game,
  status,
  date,
  href = '#',
  ctaLabel = 'Play today',
  played = false,
  stats = [],          // [{ label, value }]
  style = {},
  ...rest
}) {
  return (
    <div style={{
      maxWidth: '30rem', margin: '0 auto',
      padding: '1.5rem', textAlign: 'center',
      borderRadius: 'var(--radius-2xl)',
      background: 'var(--on-felt-fill)',
      border: '1px solid var(--gold-veil)',
      color: 'var(--chrome-text)',
      ...style,
    }} {...rest}>
      <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', opacity: 0.7, color: 'var(--gold)', fontWeight: 700 }}>
        {eyebrow}{date ? ` · ${date}` : ''}
      </div>
      <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, margin: '0.2rem 0', letterSpacing: 'var(--tracking-tight)' }}>{game}</div>
      {status != null && <div style={{ fontSize: 'var(--text-sm)', opacity: 0.8, marginBottom: '1rem' }}>{status}</div>}
      <Button href={href} variant="primary" size="lg" style={played ? { background: 'var(--on-felt-glass)', borderColor: 'var(--on-felt-line)', color: 'var(--chrome-text)' } : undefined}>
        {played ? 'Play again' : ctaLabel}
      </Button>
      {stats.length > 0 && (
        <dl style={{ display: 'flex', justifyContent: 'center', gap: '1.6rem', margin: '1.2rem 0 0' }}>
          {stats.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <dt style={{ fontSize: 'var(--text-2xs)', opacity: 0.65, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>{s.label}</dt>
              <dd style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
