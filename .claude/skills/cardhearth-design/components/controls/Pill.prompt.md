Round chip for game-nav links and the homepage "feature pills".

```jsx
<Pill active href="/klondike/">Klondike</Pill>
<Pill href="/spider/">Spider</Pill>
<Pill size="sm">🎴 18 free games</Pill>
```

- `active` fills the pill gold (current nav item).
- Renders as `<a>` when `href` is set, else a `<span>`.
