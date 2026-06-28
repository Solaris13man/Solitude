# CardHearth Design System

> Your cozy home for classic card & puzzle games.

**CardHearth** (production domain `cardhearth.com`) is a fast, free suite of
public-domain classic games that runs entirely in the browser — **Klondike,
Spider, FreeCell, Pyramid, TriPeaks, Golf, Yukon, Scorpion, Forty Thieves,
Eight Off**, the trick-taking games **Hearts, Spades, Gin Rummy, Euchre**, and
puzzles **Sudoku, Mahjong, Minesweeper, 2048** — plus a **Daily Challenge**.
No download, no account: stats, settings and in-progress games live in
`localStorage`. It's built with Astro + Tailwind; the card UI is plain DOM + CSS
transitions (no canvas). The brand promise is **fair and calm**: every Sudoku is
logic-solvable, every Mahjong board is winnable, and there are no dark patterns.

The name is a pun made literal in the logo: a **card** bearing a **heart** =
**hearth** — a warm, lamplit card table you come home to.

This design system distills CardHearth's look, voice and components so agents
can build on-brand screens, slides, marketing pages and prototypes.

## Sources
Built by reading the product's own code:
- **GitHub:** [`Solaris13man/Solitude`](https://github.com/Solaris13man/Solitude)
  (the CardHearth repo) — branch `claude/confident-tesla-jfu62b`. Key files
  studied: `src/styles/global.css` (the entire token + component CSS),
  `src/layouts/Layout.astro`, `src/components/GameShell.astro`,
  `src/components/GameArt.astro`, `src/pages/index.astro`,
  `src/games/registry.ts`, `CREDITS.md`.
  Explore the repo further to build richer, more accurate CardHearth designs.

Real binary assets imported into `assets/`: the felt + wood + stone table
textures, the app icon, and a representative set of the premium "ink-shadow"
illustrated card deck.

---

## Content fundamentals — how CardHearth writes

**Voice: warm, fair, plain-spoken, low on hype.** It talks to a relaxed adult
who wants a clean game without being nickel-and-dimed. The throughline is
*trust* — say what's true and make a promise you keep.

- **Second person, present tense.** "Pick one and play in seconds." "Explore a
  line, take it back." The reader is *you*; CardHearth is the quiet host, rarely
  "we".
- **Sentence case everywhere.** Headings, buttons and labels are sentence case
  ("Daily Challenge", "Play today's challenge →"), never ALL-CAPS marketing.
  The only uppercase is tiny tracked **eyebrows/labels** ("DAILY CHALLENGE",
  HUD keys).
- **Concrete promises over adjectives.** Not "amazing puzzles" but
  "Every Sudoku is solvable by pure logic — guaranteed." Specific guarantees
  ("Almost every deal winnable", "Every board guaranteed solvable") are the
  brand's favorite rhetorical move and recur as `✓` highlight badges.
- **Reassure about cost & privacy, repeatedly.** "No sign-up, no download.
  Progress stays on your device." "Always free to play."
- **Taglines are a short verb phrase describing play.** "Build suit runs across
  ten columns." "Bid, partner up, and take the tricks." "Slide, merge, and
  chase the famous tile."
- **The em dash is the house punctuation** for asides — used liberally. Arrows
  (`→`) end calls to action ("Play now →", "Read the story →").
- **Emoji are used sparingly and functionally** as small wayfinding/affect
  marks: ⭐ Daily, 🔥 streak, 🏆 achievements, ✅ fair, 🎴 games, 🔒 private,
  🎉 you won. Never decorative emoji spam. They sit *beside* text, not as icon
  replacements in the UI chrome (which uses line SVGs).

**Avoid:** hype, exclamation pile-ups, ALL-CAPS, fake urgency, "unlock /
premium / coins / leaderboard crush" language, and growth-hacky "start your
journey" sign-up nags. See `guidelines/brand-voice.html`.

---

## Visual foundations

**The felt table is the whole stage.** Every screen sits on a fixed,
full-viewport green felt: a warm top sheen + a dark vignette + a green gradient
(`--surface-table-bg`), with a woven-felt **grain texture** (`felt.webp`) tiled
over it. Players can reskin the felt (green / blue / slate / crimson) or swap
the whole surface for **wood (oak, walnut) or stone (marble, granite)**
textures. Content scrolls; the table never moves.

**Color.** Two brand colors do almost all the work:
- **Felt green** — `#1d7a45` surface, `#135c32` edge, `#0e3d23` chrome/menus.
- **Gold `#ffd95e`** — the "hearth glow": the single primary action color,
  focus ring, highlight text, eyebrows, the logo heart (warmer `#f5b13a`). One
  gold CTA per view.
Playing cards bring **cream `#fcfcf7`** faces with exactly **one ink
`#1d2230`** and **one red `#c2273a`** suit color, plus the deep-red card back.
A small **mint `#8be0a8`** carries "fair/positive" highlights. Puzzle accents
(sudoku/minesweeper/mahjong) add restrained blue/green/violet/teal inks. See
the **Colors** cards.

**Surfaces are translucent, not solid.** This is the signature mechanic:
panels, cards, buttons and the HUD on the felt are **translucent black fills
(`rgb(0 0 0 / .18–.30`) with a white hairline border (`rgb(255 255 255 / .14)`)
— so they read on any felt color. They are *never* opaque blocks. The one
exception is **dialogs**, which are solid light sheets (`#fff`, dark text) over
a `rgb(0 0 0 / .55)` backdrop. Glass buttons use a white `/.10` fill instead.

**Type.** System UI sans for everything (`ui-sans-serif, system-ui, …`) — no
bundled webfonts, by design (fast, native, friendly). CardHearth leans on
**weight 800** for titles with slightly tight tracking; body is 400 at 1.5,
long-form guides at 1.7. Stats/timers/deal numbers are **tabular-nums**. A
**serif (Georgia)** appears only on court-card letters and engraved numerals.

**Shape & depth.** Soft, generous radii: pills (999px) for nav and chips,
`0.55rem` buttons, `1.1rem` menu cards, `1rem` dialogs; a real **playing card**
rounds at **7.5% of its width**. Elevation is soft and dark: cards rest at
`0 4px 16px /.20` and **lift `-4px` to `0 14px 34px /.38` on hover** (also
gold-veiling their border); dropdowns/dialogs go deeper. Playing cards cast a
small `0 1px 3px /.35` shadow that grows while dragged.

**Motion is gentle and physical.** Cards move with a slight **overshoot so they
"land"** (`cubic-bezier(.3,1.25,.55,1)`), and settle with a springier curve
when released from a drag. Hovers are quick color/transform fades (~0.12–0.16s);
the win is a cascade. **Everything respects `prefers-reduced-motion`** and a
"no animations" setting. No infinite decorative loops on content.

**States.** Hover *lightens* glass (white `/.10 → /.22`) or brightens gold;
**press dims slightly and scales to ~0.98**. Focus is always a **3px gold
outline at 2px offset** (`--focus-ring`) — highly visible, accessibility-first.
Invalid/blocked moves **shake**; hints **pulse gold**.

**Imagery.** Card faces are the main imagery — either CSS-drawn pips/courts or
premium illustrated decks (the grayscale, hand-drawn **ink** deck in
`assets/cards/`). Menu tiles use small **original SVG scenes** of each game on a
felt "art well". Photography is not part of the brand; textures (felt/wood/
stone) carry material warmth instead. See **Brand** cards.

Answers to the full checklist live across `guidelines/*.html` (rendered on the
Design System tab) and the token files under `tokens/`.

---

## Iconography

- **UI chrome icons are inline line SVGs** — 24×24, `fill="none"`,
  `stroke="currentColor"`, `stroke-width≈2.2`, round caps/joins (a Lucide-like
  house style, hand-authored in the repo, *not* an icon font or library). Home,
  New (refresh), Undo/Redo, Hint (bulb), Auto-finish (chevrons), Stats (bars),
  Settings (sliders), Account (person), Games (grid). Recreate icons in this
  same style; the kit's `GameShell.jsx` shows the exact paths. **Don't** swap in
  a different icon set or weight.
- **Suit symbols are standard Unicode** (♠ ♥ ♦ ♣, U+2660–2663) in card text —
  one ink, one red. Mahjong uses CJK glyphs (中 東 春 …) + geometric marks.
- **Emoji** appear only as small affect/wayfinding marks beside text (⭐ 🔥 🏆
  ✅ 🎴 🔒 🎉) — never as functional UI control icons.
- **The logo mark** is a cream card with a gold heart on a felt-green tile
  (`assets/logo-mark.svg`, `assets/app-icon.png`); horizontal lockups in
  `assets/logo-lockup.svg` (on light) and `assets/logo-lockup-reversed.svg`
  (on felt). No icon binaries beyond these are needed.

---

## What's in this system (index)

**Root**
- `styles.css` — the single entry point consumers link; `@import`s the tokens.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`
  (radii/shadows/motion), `surfaces.css` (table backdrop + texture assets).
- `assets/` — `logo-mark.svg`, `logo-lockup.svg`, `logo-lockup-reversed.svg`,
  `app-icon.png`, `textures/` (felt, wood-oak, wood-walnut, marble, granite),
  `cards/ink-shadow/` (a sample of the premium illustrated deck).
- `SKILL.md` — Agent-Skills front matter for use in Claude Code.

**Components** (`components/`, exported on `window.CardHearthDesignSystem_7eedad`)
- `controls/` — **Button** (glass/primary/ghost), **Pill** (nav + feature),
  **Badge** (positive/gold/chip/streak).
- `cards/` — **PlayingCard** (a rendered table-deck card: pips, courts, ace,
  back), **CardFan** (an arced hand built on PlayingCard).
- `surfaces/` — **Panel** (the on-felt surface primitive), **GameCard**
  (menu tile), **Hud** (status bar), **DailyHero** (the "Today's Daily" hook).
- `feedback/` — **Dialog** (light modal sheet), **Toast** (status pill),
  **EmptyState** (calm empty/paused placeholder), **WinCelebration** (the gold
  hearth-glow win moment).
- `progress/` — **StreakCalendar** (Daily-streak month grid), **BadgeShelf**
  (achievements teaser).
Each ships a `.d.ts`, a `.prompt.md`, and a `@dsCard` demo HTML.

**Guidelines** (`guidelines/*.html`) — foundation specimen cards for the Design
System tab: Colors (felt, gold, cards, variants, accents, overlays), Type
(display, body, numeric/serif), Spacing (scale, radii), Effects (elevation,
motion/states), Brand (logo, ink deck, surfaces, voice).

**UI kit** (`ui_kits/cardhearth-web/`) — an interactive recreation of the
website: the games menu → a Klondike game shell with toolbar, HUD, settings &
win dialogs. See its own `README.md`.

> No slide-template was provided in the source, so this system ships no sample
> slides. Ask if you'd like a CardHearth deck template added.
