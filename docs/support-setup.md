# Support CTA — the one configuration step

The "support the site" experiment ships **complete but inert**. The UI, the
placements and the `support_click` tracking are all in place; what is missing
is a destination, because choosing one means choosing a payment provider and
creating an account, which is not something this repo can or should assume.

## What exists

| Piece | Where |
|---|---|
| Component | `src/components/SupportCta.astro` |
| Config | `SITE_CONFIG.support` in `src/lib/site-config.ts` |
| Placements | Post-game state (every game, via `PostGameNextUp`) and `/about/` |
| Event | `support_click` with a `placement` prop — see `docs/analytics-events.md` |

`SupportCta` renders **nothing at all** while `support.url` is empty, which is
the committed default. No placeholder, no dead link, no empty box.

## Turning it on

1. Create a page with whichever provider you prefer. Any of these work — the
   component only needs a URL:
   - **Ko-fi** — `https://ko-fi.com/<handle>`
   - **Buy Me a Coffee** — `https://buymeacoffee.com/<handle>`
   - **GitHub Sponsors** — `https://github.com/sponsors/<handle>`
   - **Stripe Payment Link** — `https://buy.stripe.com/<id>`
   - **PayPal.me** — `https://paypal.me/<handle>`

2. Paste the public URL into `src/lib/site-config.ts`:

   ```ts
   support: {
     url: 'https://ko-fi.com/cardhearth',
     label: 'Support CardHearth',
     blurb: 'Enjoying CardHearth? It is free, ad-light and has no sign-up.',
   },
   ```

3. Commit, push, redeploy. The CTA appears in both placements.

## Why no secret is involved

Every option above is a **public URL** — the same one you would put in a bio.
It is shipped to the browser like any other link. There is no API key, no
secret, and nothing that belongs in an environment variable. A test in
`src/components/SupportCta.test.ts` asserts the committed value stays empty and
contains nothing key-shaped, so a credential cannot land here by accident.

If you later want a provider that *does* need server-side credentials (a custom
Stripe Checkout session rather than a Payment Link), that is a different
integration and needs a server endpoint — this static build has no place to put
a secret. Stop and design that separately rather than extending this component.

## Deliberate constraints

The CTA is built to be ignorable:

- No popup, no modal, no interstitial, no timed reveal.
- Never overlays a control or interrupts a game in progress.
- Last item in the post-game stack, below replay and the next-game suggestion.
- No urgency, no guilt, no fake scarcity — a test asserts the copy stays clean.
- Opens in a new tab so a game in progress is never destroyed.

## Reading the result

`support_click` carries `placement` (`postgame` or `about`). The ratio worth
watching is `support_click / game_complete`; `/about/` traffic is small enough
that its placement is mostly a sanity check. Note that the event measures
*intent* — clicks — not revenue. Actual conversion lives in the provider's own
dashboard, and the two will not match.
