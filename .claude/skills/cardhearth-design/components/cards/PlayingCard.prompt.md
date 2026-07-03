A single rendered playing card — the CardHearth table deck as a reusable primitive. Cream gradient face, side-by-side corner indices, classic pip arrangements (2–10), framed Georgia letter for J/Q/K, a big centred Ace, and the gold-inset gradient back. Pure CSS/SVG, no image assets.

```jsx
<PlayingCard rank="Q" suit="H" width={104} />
<PlayingCard rank="10" suit="S" />
<PlayingCard rank="A" suit="D" selected />
<PlayingCard faceDown width={104} />
```

- `suit` is `'S' | 'H' | 'D' | 'C'`; hearts & diamonds render in `--suit-red`, spades & clubs in `--ink-black`.
- Size with `width` (px) — height is locked to the 150:210 card ratio, and pips/letters scale with it.
- `selected` adds the gold ring used for a chosen card; `faceDown` shows the patterned back.
- Build hands/piles by overlapping several, or use `CardFan` for an arced hand.
