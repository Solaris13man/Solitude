A month grid for the Daily Challenge streak — solved days fill gold with a ✓, today is outlined, future days dim. Use it anywhere you want to make a per-day streak feel tangible and collectible.

```jsx
<StreakCalendar
  year={2026}
  month={5}
  today={28}
  solved={[1, 2, 3, 5, 6, 7, 9, 10, 11, 13]}
/>
```

- Defaults to the **current** month/year/today when those props are omitted.
- `solved` accepts an array or a `Set` of day numbers.
- Wraps itself in a gold-veiled `Panel`; pass `style` to size it (it fills its container width — cap with `maxWidth`).
- Pair it with a heading + "X of Y solved" line above it for the full "fill your calendar" hook.
