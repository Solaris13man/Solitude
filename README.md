# CardHearth (repo: Solitude) — Classic Games

A fast, modern suite of public-domain classics that runs entirely in the
browser: **Klondike**, **Spider** (1/2/4 suits), **FreeCell**, a **Daily
Challenge**, and **Sudoku**, with more game families (dominoes, board games)
planned. Static site, no backend, no
accounts — stats, settings, and in-progress games persist in `localStorage`.

Built with [Astro](https://astro.build), TypeScript, and Tailwind CSS. The
card UI is plain DOM + CSS transitions (no canvas), with one pointer-events
code path for mouse, touch, and pen.

## Features

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

The production domain is `https://cardhearth.com` (set as `site` in
`astro.config.mjs`); sitemap and canonical URLs are generated from it.

## Project layout

The structure is deliberately not card-centric: `src/lib/` holds services any
game can use, and each engine family lives under `src/games/<family>/`. A
future chess or dominoes game adds a folder there, an entry in
`src/games/registry.ts`, and a page — nothing else changes.

```
src/
├─ pages/                  # Menu (index) + one page per game + content pages
│  ├─ index.astro          # Game menu landing page
│  ├─ spider.astro
│  └─ freecell.astro
├─ layouts/Layout.astro    # HTML shell + SEO meta
├─ components/
│  ├─ GameShell.astro      # Shared chrome: toolbar, HUD, dialogs, board host
│  └─ GameNav.astro        # Game switcher menu (driven by the registry)
├─ styles/global.css       # Tailwind + card/board CSS
├─ lib/                    # Game-agnostic services
│  ├─ history.ts           # Generic snapshot undo/redo
│  ├─ stats.ts             # Per-game localStorage stats
│  ├─ settings.ts          # Settings + theming
│  └─ sound.ts             # Synthesized WebAudio effects
└─ games/
   ├─ registry.ts          # Site-wide game catalogue (menu, links)
   ├─ sudoku/              # The puzzle family: engine + grid UI + controller
   └─ cards/               # The card-game family
      ├─ types.ts          # Shared card state + the Ruleset interface
      ├─ rng.ts            # Seeded PRNG (mulberry32)
      ├─ deck.ts           # Card model + Fisher–Yates shuffle
      ├─ klondike.ts       # Rules + hints + auto-complete (one per game)
      ├─ spider.ts
      ├─ freecell.ts
      ├─ board.ts          # Config-driven DOM rendering + hit-testing
      ├─ dragdrop.ts       # Pointer-events drag / tap handling
      ├─ animations.ts     # Deal stagger + win cascade
      └─ controller.ts     # Generic controller for any card Ruleset
```

## Accounts, badges & the business layer (optional, off by default)

Everything below is gated behind `src/lib/site-config.ts` and dormant until you
turn it on — the site ships fully private and guest-only.

- **Achievements & badges** work for everyone right now, stored on-device. A
  badge unlocks with a celebratory toast the moment you qualify; the full
  collection (earned + locked) lives on `/account/`.
- **Optional Google accounts + cloud sync.** To enable real sign-in and
  cross-device sync:
  1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
  2. Enable the Google provider in Supabase Auth (add a Google OAuth client
     id/secret from the Google Cloud Console; add your site to the redirect
     allow-list).
  3. In `src/lib/site-config.ts` set `accounts.enabled = true` and fill in
     `supabaseUrl` + `supabaseAnonKey`.
  Sign-in then appears on `/account/`, and progress merges across devices
  (never losing a streak or badge). Sync runs over plain `fetch` against
  Supabase's REST/auth endpoints — no SDK dependency — protected by row-level
  security.
- **Analytics & ads** are likewise one config switch each (`analytics.provider`
  / `ads.enabled`), with `game_won`/`game_lost` events already wired through the
  shared result hook and an `AdSlot` placed in every game page.
- **PWA**: a manifest + service worker make the site installable.

## License & assets

All code and artwork are original; card faces are rendered with CSS and
standard Unicode suit symbols. See [CREDITS.md](CREDITS.md).
