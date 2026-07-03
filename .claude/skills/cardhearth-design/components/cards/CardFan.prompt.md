A hand of cards held in an arc — `PlayingCard`s overlapped and rotated around a low pivot, so it reads like a hand at the table. The hovered (or `selectedIndex`) card lifts; pass `onSelect` to make it pickable.

```jsx
<CardFan
  cards={[
    { rank: 'A', suit: 'S' },
    { rank: 'K', suit: 'H' },
    { rank: 'Q', suit: 'H' },
    { rank: '10', suit: 'D' },
    { rank: '7', suit: 'C' },
  ]}
  width={92}
  selectedIndex={1}
  onSelect={(i, card) => playCard(card)}
/>

{/* an opponent's concealed hand */}
<CardFan cards={Array(13).fill({})} faceDown width={56} />
```

- `cards` is an array of `{ rank, suit }` (or `{ faceDown: true }` per card); set `faceDown` on the fan to conceal the whole hand.
- Tune the spread with `spread` (degrees between cards) and `overlap` (0–1); `width` scales every card.
