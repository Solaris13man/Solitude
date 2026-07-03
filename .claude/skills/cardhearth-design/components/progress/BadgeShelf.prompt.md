A compact achievements teaser shelf — an eyebrow label and bold summary on the left, a row of badge chips on the right (earned glow gold, locked are grayed). Use it on a menu or account page to nudge players toward collecting badges.

```jsx
<BadgeShelf
  summary="3 of 24 unlocked"
  href="/account/"
  badges={[
    { icon: '🃏', name: 'First win', earned: true },
    { icon: '🔥', name: '5-day streak', earned: true },
    { icon: '🎯', name: 'No hints', earned: true },
    { icon: '🧩', name: 'Puzzle master', earned: false },
  ]}
/>
```

- Renders as a `<a>` (with a trailing gold →) when `href` is set, otherwise a `<div>`.
- `label` defaults to "Achievements"; pass your own eyebrow if needed.
- Keep the chip row short (4–6) — it's a teaser, not the full collection.
