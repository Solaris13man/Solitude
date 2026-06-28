A calm, centred placeholder for "nothing here yet" — no games match a filter, a paused board, an empty stats history. Translucent so it reads as part of the felt table rather than a hard card.

```jsx
<EmptyState
  icon="🔍"
  title="No games match"
  message="Try clearing a filter, or browse the full menu — every game here is winnable by design."
  action={<Button href="/">Browse all games</Button>}
/>
```

- Pass `icon` as an emoji, glyph, or small `<svg>` — it sits in a glass disc.
- Keep `message` to one reassuring line; supply a single `action` (a Button) for the next step, or omit it.
- Use for empty filters, paused boards, and blank history — not for errors that need a modal (use `Dialog`).
