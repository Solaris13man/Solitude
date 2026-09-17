# CardHearth event taxonomy

Every product event goes through `track()` in `src/lib/analytics.ts`, which
forwards to whichever providers `site-config.ts` has enabled (GA4, self-hosted
Plausible, Ahrefs) and always mirrors to `window.__chEvents` for debugging.

Three rules hold everywhere:

1. **Analytics can never break gameplay.** `track()` is wrapped in try/catch and
   is a no-op when no provider is configured.
2. **No personal or sensitive data.** No card states, no free text, no user IDs,
   no external referrers. `source_page` is a same-origin pathname or nothing.
3. **No duplicates on rerender.** Per-deal guards live in `GameSession`
   (`src/lib/game-session.ts`); the delegated click listener binds once.

## Verifying events locally

```bash
npm run dev
```

Open any game and run in the console:

```js
__chEvents            // every event this page has fired, in order
__chEvents.map(e => e.event)
```

In production, GA4 DebugView and the Plausible dashboard's custom-event list
show the same stream.

---

## Game funnel

Emitted by `GameSession`. One session per page, keyed off the `data-game-id`
attribute the game shell renders — so `game_view` is wired up by markup alone
and no controller contains provider-specific code.

| Event | When | Props |
|---|---|---|
| `game_view` | Once per page load of a game page | `game`, `source_page`\* |
| `game_start` | The player's **first real interaction** with a deal — a move, a tap, a bid. Not page load, not dealing | `game`, `variant`\* |
| `game_complete` | The deal finished, once | `game`, `result` (`won`/`lost`/game-specific), `duration_seconds`\*, `variant`\* |
| `game_replay` | The player chose to go again from the end-of-game state | `game`, `mode` (`new_deal`/`same_deal`/`next_round`) |

\* omitted when unavailable.

`deal()` re-arms the start/complete guards, so one deal produces at most one
start and one complete however often the board rerenders. If a game finishes
with no recorded interaction (a resumed save, an auto-finish), `complete()`
backfills `game_start` first — `game_complete` can therefore never outnumber
`game_start`, and the completion ratio stays meaningful.

## Navigation intent

Emitted by one delegated, capture-phase listener (`initLinkTracking`). A link
opts in with markup only:

```html
<a href="/hearts/" data-ch-track="related_game" data-ch-to="hearts">Hearts</a>
<a href="/guides/spades-rules/" data-ch-track="rules">Spades rules</a>
<a href="/daily-challenge/" data-ch-track="daily" data-ch-placement="postgame">Daily</a>
<a href="…" data-ch-track="support" data-ch-placement="postgame">Support</a>
```

| Event | Trigger | Props |
|---|---|---|
| `related_game_click` | `data-ch-track="related_game"` | `from_game`, `to_game` |
| `rules_click` | `data-ch-track="rules"` | `game` |
| `daily_challenge_click` | `data-ch-track="daily"` | `game`, `placement` |
| `support_click` | `data-ch-track="support"` | `placement` |

`from_game`/`game` default to the page's `data-game-id`; `data-ch-game`
overrides it on guide pages, which have no game of their own.

## Daily Challenge

Emitted by `DailyMode` (`src/lib/daily-mode.ts`).

| Event | When | Props |
|---|---|---|
| `daily_challenge_view` | A game page opened in daily mode (`?daily=…`) | `game`, `archive` |
| `daily_challenge_start` | First move on the daily, once per page load | `game`, `archive` |
| `daily_challenge_complete` | First solve of a given day | `game`, `duration_seconds`, `archive` |

`daily_challenge_view` fires on the **game** page, not the `/daily-challenge/`
hub, so it counts challenges actually reached rather than hub pageviews. The
hub's own pageview is `daily_viewed`.

## Pre-existing events (unchanged)

These predate the taxonomy above and are **kept as-is** so the existing GA4 and
Plausible history stays continuous. They overlap with the funnel events by
design.

| Event | Props | Relationship to the new events |
|---|---|---|
| `game_started` | `game`, `variant` | Fires when a deal is **dealt**. `game_start` fires when the player actually plays it |
| `game_won` / `game_lost` | `game`, `variant`, `seconds` | Split form of `game_complete`; emitted by `recordResult()` |
| `daily_solved` | `game`, `seconds`, `archive` | Same moment as `daily_challenge_complete` |
| `daily_viewed` | `game` | `/daily-challenge/` hub pageview |
| `daily_cta_clicked` | `game`, `solved` | The post-game daily nudge |
| `share_clicked` | `game`, `type` | Deal / daily / profile share |
| `badge_unlocked` | `badge_id`, `badge_name` | Achievement unlock |

## Sprint metrics

The ratios to watch, and how to compute them:

| Metric | Formula |
|---|---|
| Engagement rate | `game_start` / `game_view` |
| Completion rate | `game_complete` / `game_start` |
| Replay rate | `game_replay` / `game_complete` |
| Cross-game flow | `related_game_click` / `game_complete` |
| Guide pull-through | `rules_click` / `game_view` |
| Daily funnel | `daily_challenge_start` / `daily_challenge_view`, then `_complete` / `_start` |
| Support intent | `support_click` / `game_complete` |

### Configuring goals

- **Plausible** — Site settings → Goals → add a custom event goal for each of
  `game_complete`, `game_replay`, `daily_challenge_complete`, `support_click`.
  Custom properties (`game`, `result`, `mode`, `placement`) are then filterable
  on the dashboard.
- **GA4** — Admin → Events → mark `game_complete`, `daily_challenge_complete`
  and `support_click` as key events. Register `game`, `result`, `mode` and
  `placement` as custom dimensions (Admin → Custom definitions) or they will not
  appear in reports.
