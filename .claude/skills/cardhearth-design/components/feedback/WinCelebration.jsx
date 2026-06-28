import React from 'react';

/**
 * WinCelebration — the CardHearth win moment. A warm gold "hearth" glow with
 * slow radiating rays behind a trophy, the headline, optional stat readout,
 * and action buttons. Deliberately confetti-free: it's a hearth lighting up,
 * not a party popper. Drop it inside a Dialog, or use standalone on the felt.
 * Animation is gated on prefers-reduced-motion.
 */
export function WinCelebration({
  title = 'You won!',
  subtitle,
  badge = '🏆',
  stats = [],          // [{ label, value }]
  actions = null,
  style = {},
  ...rest
}) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      gap: '0.5rem', padding: '1.6rem 1.4rem 1.4rem',
      borderRadius: 'var(--radius-2xl)',
      color: 'var(--chrome-text)',
      ...style,
    }} {...rest}>
      <style>{`
        @keyframes ch-rays-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes ch-trophy-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .ch-rays { animation: none !important; }
          .ch-trophy { animation: none !important; }
        }
      `}</style>
      {/* radiating gold rays */}
      <div className="ch-rays" aria-hidden="true" style={{
        position: 'absolute', left: '50%', top: '34%', width: '150%', aspectRatio: '1',
        transform: 'translate(-50%, -50%)',
        background: 'repeating-conic-gradient(from 0deg, rgb(255 217 94 / 0.16) 0deg 7deg, transparent 7deg 18deg)',
        WebkitMaskImage: 'radial-gradient(closest-side, #000 12%, transparent 72%)',
        maskImage: 'radial-gradient(closest-side, #000 12%, transparent 72%)',
        animation: 'ch-rays-spin 24s linear infinite',
        pointerEvents: 'none',
      }} />
      {/* warm hearth bloom */}
      <div aria-hidden="true" style={{
        position: 'absolute', left: '50%', top: '34%', width: '70%', aspectRatio: '1',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(closest-side, rgb(255 217 94 / 0.30), transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div className="ch-trophy" style={{
        position: 'relative', fontSize: '2.6rem', lineHeight: 1,
        filter: 'drop-shadow(0 3px 6px rgb(0 0 0 / 0.35))',
        animation: 'ch-trophy-pop 0.4s cubic-bezier(0.26,1.55,0.45,1) both',
      }}>{badge}</div>
      <div style={{ position: 'relative', fontSize: 'var(--text-3xl)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)' }}>{title}</div>
      {subtitle != null && <div style={{ position: 'relative', fontSize: 'var(--text-sm)', opacity: 0.82 }}>{subtitle}</div>}
      {stats.length > 0 && (
        <dl style={{
          position: 'relative', display: 'flex', justifyContent: 'center', gap: '1.6rem',
          margin: '0.9rem 0 0.2rem',
        }}>
          {stats.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <dt style={{ fontSize: 'var(--text-2xs)', opacity: 0.65, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>{s.label}</dt>
              <dd style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--gold)' }}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions != null && (
        <div style={{ position: 'relative', display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.7rem' }}>{actions}</div>
      )}
    </div>
  );
}
