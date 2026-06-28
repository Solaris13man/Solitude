import React from 'react';
import { PlayingCard } from './PlayingCard.jsx';

/**
 * CardFan — a hand of cards held in an arc. Pass an array of {rank, suit} (or
 * `faceDown` for an opponent's hand); cards overlap and rotate around a low
 * pivot so the fan reads like a hand at the table. The hovered/selected card
 * lifts. Width scales every card.
 */
export function CardFan({
  cards = [],
  width = 92,
  spread = 8,        // degrees between adjacent cards
  overlap = 0.46,    // fraction of card width hidden behind the next
  faceDown = false,
  selectedIndex = -1,
  onSelect,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(-1);
  const n = cards.length;
  const w = width;
  const step = w * (1 - overlap);
  const mid = (n - 1) / 2;
  // arc height so end cards dip; pivot sits below the hand
  const lift = w * 0.5;

  return (
    <div style={{
      position: 'relative',
      width: n > 0 ? step * (n - 1) + w : w,
      height: w * 1.4 + lift * 0.6,
      ...style,
    }} {...rest}>
      {cards.map((c, i) => {
        const angle = (i - mid) * spread;
        const dx = i * step;
        const dip = Math.abs(i - mid) * (lift * 0.12);
        const isSel = i === selectedIndex;
        const isHot = i === hover;
        return (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(-1)}
            onClick={onSelect ? () => onSelect(i, c) : undefined}
            style={{
              position: 'absolute', left: dx, top: 0,
              transformOrigin: '50% 130%',
              transform: `rotate(${angle}deg) translateY(${dip + (isHot || isSel ? -w * 0.16 : 0)}px)`,
              transition: 'transform 0.16s ease',
              cursor: onSelect ? 'pointer' : 'default',
              zIndex: isHot || isSel ? 50 : i,
            }}
          >
            <PlayingCard
              rank={c.rank} suit={c.suit}
              faceDown={faceDown || c.faceDown}
              width={w}
              selected={isSel}
            />
          </div>
        );
      })}
    </div>
  );
}
