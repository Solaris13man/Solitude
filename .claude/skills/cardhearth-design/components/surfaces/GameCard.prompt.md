A games-menu tile: felt art well on top, then name / tagline / highlight / "Play now →". Lifts and gold-veils on hover.

```jsx
<GameCard
  name="FreeCell"
  tagline="Every deal is open — and almost all are winnable"
  highlight="Almost every deal winnable"
  href="/freecell/"
>
  <FreeCellArt />   {/* an <svg> scene or <img> */}
</GameCard>
```

- Pass artwork as children — it sits in the felt "art well" with a drop shadow.
- `highlight` renders a mint ✓ trust badge; omit when there's no guarantee to make.
