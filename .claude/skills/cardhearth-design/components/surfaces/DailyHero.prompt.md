The home page's "Today's Daily" hook as a reusable surface — a gold-veiled panel with an eyebrow, the day's game name, a status line, the play CTA, and an optional stat row. It's the site's strongest return-driver, so it's worth keeping consistent.

```jsx
<DailyHero
  game="Klondike"
  date="March 14"
  status="Not played yet — keep your 6-day streak alive"
  href="/daily/"
  stats={[
    { label: 'Streak', value: '6 🔥' },
    { label: 'Best', value: 14 },
    { label: 'Solved', value: 71 },
  ]}
/>
```

- Set `played` once the user has finished today's deal — the gold CTA softens to a glass "Play again".
- Keep `stats` to ~3 figures (streak / best / solved); omit for a leaner banner.
- For the compact in-page reminder use a `Panel tone="gold"` instead; this is the full hero.
