Felt-table button — glass by default, gold for the one primary action per view.

```jsx
<Button variant="primary" size="lg">Play today's challenge →</Button>
<Button icon={<HomeIcon />}>Home</Button>
<Button href="/account/" variant="glass">Account & badges</Button>
```

- `variant`: `glass` (translucent on felt), `primary` (gold CTA), `ghost` (borderless).
- `size`: `sm` / `md` / `lg`. Mobile keeps ≥44px tap height automatically.
- Use exactly one `primary` per screen; everything else is `glass`/`ghost`.
