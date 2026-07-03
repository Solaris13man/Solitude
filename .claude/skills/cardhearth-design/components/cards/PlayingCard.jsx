import React from 'react';

/**
 * PlayingCard — a single rendered playing card, faithful to the CardHearth
 * table deck: cream face with side-by-side corner indices, classic pip
 * arrangements for number cards, a framed Georgia letter for courts, a big
 * centred ace, and the gold-inset gradient back. Pure CSS/SVG — no images.
 *
 * suit: 'S' | 'H' | 'D' | 'C'   rank: 'A' '2'…'10' 'J' 'Q' 'K'
 * Sizes from `width` (height follows the 150:210 card ratio).
 */
const GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED = new Set(['H', 'D']);

// pip layouts: [colX (0 left · 0.5 centre · 1 right), rowY (0 top → 1 bottom), flip?]
const PIPS = {
  '2': [[0.5, 0], [0.5, 1, 1]],
  '3': [[0.5, 0], [0.5, 0.5], [0.5, 1, 1]],
  '4': [[0, 0], [1, 0], [0, 1, 1], [1, 1, 1]],
  '5': [[0, 0], [1, 0], [0.5, 0.5], [0, 1, 1], [1, 1, 1]],
  '6': [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1, 1], [1, 1, 1]],
  '7': [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1, 1], [1, 1, 1]],
  '8': [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75, 1], [0, 1, 1], [1, 1, 1]],
  '9': [[0, 0], [1, 0], [0, 0.333], [1, 0.333], [0.5, 0.5], [0, 0.667, 1], [1, 0.667, 1], [0, 1, 1], [1, 1, 1]],
  '10': [[0, 0], [1, 0], [0.5, 0.167], [0, 0.333], [1, 0.333], [0, 0.667, 1], [1, 0.667, 1], [0.5, 0.833, 1], [0, 1, 1], [1, 1, 1]],
};

export function PlayingCard({
  rank = 'A',
  suit = 'S',
  faceDown = false,
  width = 96,
  selected = false,
  style = {},
  ...rest
}) {
  const w = typeof width === 'number' ? width : parseFloat(width);
  const h = w * (210 / 150);
  const radius = Math.max(6, w * 0.075);
  const glyph = GLYPH[suit] || '♠';
  const isRed = RED.has(suit);
  const ink = isRed ? 'var(--suit-red)' : 'var(--ink-black)';
  const isCourt = rank === 'J' || rank === 'Q' || rank === 'K';
  const isAce = rank === 'A';

  const wrap = {
    position: 'relative',
    width: w, height: h, flex: 'none',
    borderRadius: radius,
    boxShadow: selected
      ? '0 0 0 3px var(--gold), 0 4px 12px rgb(0 0 0 / 0.35)'
      : 'var(--shadow-playcard)',
    transition: 'box-shadow 0.15s ease, transform 0.15s ease',
    ...style,
  };

  if (faceDown) {
    return (
      <div role="img" aria-label="Face-down card" style={{
        ...wrap,
        border: '1px solid rgb(0 0 0 / 0.25)',
        background: 'linear-gradient(155deg, var(--card-back-a), var(--card-back-b))',
        boxShadow: `${wrap.boxShadow}, inset 0 0 0 ${Math.max(2, w * 0.045)}px rgb(255 255 255 / 0.85)`,
        overflow: 'hidden',
      }} {...rest}>
        <svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
          aria-hidden="true" style={{ opacity: 0.9 }}>
          <defs>
            <pattern id={`cb${w}`} width="6" height="6" patternUnits="userSpaceOnUse">
              <path d="M3 0 6 3 3 6 0 3Z" fill="none" stroke="white" strokeOpacity="0.2" />
              <circle cx="3" cy="3" r="0.4" fill="white" fillOpacity="0.25" />
            </pattern>
          </defs>
          <rect width="24" height="24" fill={`url(#cb${w})`} />
        </svg>
      </div>
    );
  }

  const cornerFont = Math.max(9, w * 0.2);
  const Corner = ({ pos }) => (
    <div style={{
      position: 'absolute', lineHeight: 1, fontWeight: 700, color: ink,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: w * 0.01,
      fontSize: cornerFont,
      ...(pos === 'tl'
        ? { top: '5%', left: '6.5%' }
        : { bottom: '5%', right: '6.5%', transform: 'rotate(180deg)' }),
    }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{rank}</span>
      <span style={{ fontSize: '0.86em' }}>{glyph}</span>
    </div>
  );

  let center = null;
  if (isAce) {
    center = (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: ink, fontSize: w * 0.56, lineHeight: 1 }}>{glyph}</div>
    );
  } else if (isCourt) {
    center = (
      <>
        <div style={{ position: 'absolute', inset: '15% 13%', border: `1.5px solid ${ink}`, borderRadius: Math.max(3, w * 0.04), opacity: 0.32 }} />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: w * 0.46, color: ink, lineHeight: 1 }}>{rank}</div>
        <span style={{ position: 'absolute', top: '18%', left: '18%', fontSize: w * 0.17, color: ink, lineHeight: 1 }}>{glyph}</span>
        <span style={{ position: 'absolute', bottom: '18%', right: '18%', fontSize: w * 0.17, color: ink, lineHeight: 1, transform: 'rotate(180deg)' }}>{glyph}</span>
      </>
    );
  } else {
    const spots = PIPS[String(rank)] || [];
    center = (
      <div style={{ position: 'absolute', inset: '15% 17%' }}>
        {spots.map(([cx, cy, flip], i) => (
          <span key={i} style={{
            position: 'absolute', left: `${cx * 100}%`, top: `${cy * 100}%`,
            transform: `translate(-50%, -50%)${flip ? ' rotate(180deg)' : ''}`,
            fontSize: w * 0.2, lineHeight: 1, color: ink,
          }}>{glyph}</span>
        ))}
      </div>
    );
  }

  return (
    <div role="img" aria-label={`${rank} of ${{ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[suit]}`}
      style={{
        ...wrap,
        background: 'linear-gradient(160deg, #ffffff 0%, var(--card-cream) 65%)',
        border: '1px solid rgb(0 0 0 / 0.18)',
        overflow: 'hidden',
      }} {...rest}>
      <Corner pos="tl" />
      {center}
      <Corner pos="br" />
    </div>
  );
}
