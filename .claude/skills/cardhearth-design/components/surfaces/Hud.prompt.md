The game status bar — a glass pill of tabular stats above the board.

```jsx
<Hud items={[
  { label: 'Time', value: '2:14' },
  { label: 'Moves', value: 38 },
  { label: 'Score', value: 120 },
]} deal="#1042" />
```

- Figures are tabular so the timer doesn't jitter. `deal` is shown muted at the end (shareable deal number).
