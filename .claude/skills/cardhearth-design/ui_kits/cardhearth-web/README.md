# CardHearth Web — UI kit

A cosmetic, click-through recreation of the CardHearth website
(`https://cardhearth.com`) built from the component primitives in this design
system. Not a real rules engine — it's a faithful visual + interaction mock.

## Flow
`index.html` mounts an `App` with two screens:
1. **Home / games menu** (`Home.jsx`) — account button, hero + feature pills,
   the "fair play" trust strip, the gold Daily Challenge banner, the Card Games
   and Puzzles grids, and the "Why play" benefits. Click any game card or the
   Daily banner to open it.
2. **Game shell** (`GameShell.jsx`) — the in-game view: header toolbar
   (Home / New / Undo / Hint / Auto-finish / Stats / Settings), the glass HUD,
   a Klondike board rendered with the premium **ink** deck, collapsible
   instructions, and the Settings + "You won!" dialogs. "Home" returns to the
   menu; "Auto-finish" opens the win dialog.

## Files
- `index.html` — entry point + felt backdrop; loads the bundle then the JSX.
- `art.jsx` — `window.GameArt` — original menu artwork (cream cards, ink/red
  suits) for the menu tiles, ported from the site's `GameArt`.
- `Home.jsx` — `window.Home`.
- `GameShell.jsx` — `window.GameShell` + the `PlayCard` / `Slot` board pieces.

## Composes these primitives
`Button`, `Pill`, `Badge`, `Panel`, `GameCard`, `Hud`, `Dialog` from
`window.CardHearthDesignSystem_7eedad` (the compiled `_ds_bundle.js`).
