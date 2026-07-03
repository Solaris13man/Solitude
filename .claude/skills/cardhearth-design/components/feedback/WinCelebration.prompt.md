The CardHearth win moment. A warm gold "hearth" glow with slowly radiating rays behind a trophy, the headline, an optional stat readout, and actions. Deliberately **confetti-free** — the brand's win is a hearth lighting up, not a party popper — and the ray spin is gated on `prefers-reduced-motion`.

```jsx
<WinCelebration
  title="You won!"
  subtitle="Klondike · Daily for March 14"
  stats={[
    { label: 'Time', value: '2:14' },
    { label: 'Moves', value: 38 },
    { label: 'Streak', value: '6 🔥' },
  ]}
  actions={<>
    <Button>Share deal</Button>
    <Button variant="primary">New deal</Button>
  </>}
/>
```

- Use standalone on the felt, or drop it inside a `Dialog` as the win sheet's body.
- Swap `badge` for a different glyph/`<svg>` (a suit, a medal); keep `stats` to ~3 figures.
- Don't add confetti or extra motion — the rotating rays + trophy pop are the whole celebration.
