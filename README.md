# Solitude — Klondike Solitaire

A fast, modern, public-domain Klondike Solitaire that runs entirely in the
browser. Static site, no backend, no accounts — stats, settings, and the
in-progress game persist in `localStorage`.

Built with [Astro](https://astro.build), TypeScript, and Tailwind CSS. The
game UI is plain DOM + CSS transitions (no canvas), with one pointer-events
code path for mouse, touch, and pen.

## Features (Milestone 1)

- Full Klondike rules engine: Draw 1 / Draw 3, alternating-color tableau
  builds, same-suit foundations, Kings to empty columns, win detection
- Seeded, reproducible deals (mulberry32 + Fisher–Yates)
- Drag-and-drop **and** tap-to-auto-move (tap sends a card to the foundation
  when possible, otherwise to the best tableau spot)
- Unlimited undo/redo, hints, and one-click auto-finish when the game is
  trivially won
- Timer, move counter, and standard scoring
- Win cascade animation (respects `prefers-reduced-motion`)
- Stats: games played/won, win rate, current/best streak, best times per draw
  mode; in-progress games resume after a reload
- Settings: draw mode, light/dark theme, felt color, card back, left-handed
  layout, animations on/off
- Responsive from portrait phone to desktop; keyboard playable with ARIA
  labels and live-region announcements

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `D` | Draw from stock / recycle waste |
| `N` | New game |
| `U` / `Ctrl+Z` | Undo |
| `R` / `Ctrl+Shift+Z` | Redo |
| `H` | Hint |
| `A` | Auto-finish (when available) |
| `Tab` + `Enter` | Focus a card and auto-move it |

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
```

## Test

The rules engine, seeded shuffle, undo history, auto-complete, hints, and the
DOM board/controller wiring are covered by Vitest:

```sh
npm test
```

## Build & deploy

```sh
npm run build    # outputs a fully static site to dist/
npm run preview  # serve the build locally
```

The `dist/` folder deploys to any static host.

**Cloudflare Pages:** create a Pages project from this repo, framework preset
*Astro*, build command `npm run build`, output directory `dist`.

**Netlify:** new site from Git, build command `npm run build`, publish
directory `dist`.

Before going live, set your real domain as `site` in `astro.config.mjs` so
canonical URLs resolve correctly.

## Project layout

```
src/
├─ pages/index.astro       # Home — plays Klondike immediately
├─ layouts/Layout.astro    # HTML shell + SEO meta
├─ styles/global.css       # Tailwind + card/board CSS
└─ game/
   ├─ engine/              # Pure rules logic (unit-tested, no DOM)
   │  ├─ rng.ts            # Seeded PRNG (mulberry32)
   │  ├─ deck.ts           # Card model + Fisher–Yates shuffle
   │  ├─ klondike.ts       # Deal, legal moves, scoring, win detection
   │  ├─ history.ts        # Undo/redo
   │  └─ autocomplete.ts   # Auto-finish move generator
   ├─ ui/
   │  ├─ board.ts          # DOM rendering + layout + hit-testing
   │  ├─ dragdrop.ts       # Pointer-events drag / tap handling
   │  ├─ animations.ts     # Deal stagger + win cascade
   │  └─ hints.ts          # Legal-move suggestion
   ├─ stats.ts             # localStorage stats
   ├─ themes.ts            # Settings + theming
   └─ main.ts              # Controller wiring it all together
```

## License & assets

All code and artwork are original; card faces are rendered with CSS and
standard Unicode suit symbols. See [CREDITS.md](CREDITS.md).
