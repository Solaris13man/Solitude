# Deploying CardHearth

The site is a static Astro build (`npm run build` → `dist/`). These steps take
it live on **Cloudflare Pages** with the **cardhearth.com** domain (bought at
Namecheap), then turn on Search Console and AdSense.

---

## 1. Put the code on GitHub

The repo is already on GitHub. Make sure your latest branch is pushed and, when
ready, merge it to `main` (Cloudflare deploys from a branch you choose).

---

## 2. Create the Cloudflare Pages project

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create**
   → **Pages** → **Connect to Git**.
2. Authorize GitHub and pick the `solitude` repository.
3. Build settings:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Production branch:** `main` (or whichever branch you merge to)
4. **Save and Deploy.** You'll get a `*.pages.dev` URL in ~1 minute — open it
   and confirm the games work.

Every push to the production branch now auto-builds and deploys. PRs get
preview URLs automatically.

---

## 3. Point cardhearth.com at it

The cleanest path is to let Cloudflare manage DNS (it gives the best
performance and the apex-domain handling "just works").

### Option A — move DNS to Cloudflare (recommended)

1. Cloudflare dash → **Add a site** → enter `cardhearth.com` → Free plan.
2. Cloudflare shows two **nameservers** (e.g. `xena.ns.cloudflare.com`).
3. In **Namecheap** → Domain List → cardhearth.com → **Manage** → **Nameservers**
   → choose **Custom DNS** → paste Cloudflare's two nameservers → save.
   (Propagation: usually under an hour, up to 24h.)
4. Back in the Pages project → **Custom domains** → **Set up a custom domain**
   → add `cardhearth.com` and `www.cardhearth.com`. Cloudflare creates the DNS
   records and TLS certificate automatically.
5. Add a redirect so one is canonical: Pages → the `www` domain → set it to
   redirect to the apex (or vice-versa). Match whichever you prefer; the site's
   canonical URLs use the bare apex `https://cardhearth.com/`.

### Option B — keep DNS at Namecheap

1. Pages → **Custom domains** → add `cardhearth.com`; Cloudflare shows the
   target (e.g. `cardhearth.pages.dev`).
2. In Namecheap → **Advanced DNS**:
   - `CNAME` record, host `www`, value `cardhearth.pages.dev`.
   - For the apex, add Namecheap's **ALIAS/CNAME flattening** record (host `@`)
     pointing to `cardhearth.pages.dev`. (Namecheap supports an `ALIAS` record;
     if not available on your plan, use Option A.)
3. Wait for verification in the Pages dashboard.

HTTPS is automatic either way.

---

## 4. Tell Google about it

1. <https://search.google.com/search-console> → add property `cardhearth.com`
   → verify (easiest via the DNS TXT record Cloudflare lets you add in one
   click, or the HTML-tag method).
2. Submit the sitemap: **Sitemaps** → enter `sitemap-index.xml` → Submit.
   (It's generated at `https://cardhearth.com/sitemap-index.xml`.)
3. Request indexing for the homepage and a couple of game pages to prime it.

---

## 5. Turn on analytics (recommended before ads)

In `src/lib/site-config.ts`:

```ts
analytics: { provider: 'plausible', domain: 'cardhearth.com' },
```

Create the matching site at <https://plausible.io> (or self-host Umami).
Commit, push, redeploy. Pageviews and `game_won`/`game_lost` events start
flowing — now you can see which games get traffic.

---

## 6. Turn on AdSense (first revenue)

1. Apply at <https://adsense.google.com> with `cardhearth.com`. Approval needs
   real content + a privacy policy — both already in place (`/privacy/`).
2. Once approved, create an **in-content display ad unit**; copy its
   **publisher id** (`ca-pub-…`) and the unit's **numeric slot id**.
3. In `src/lib/site-config.ts`:

```ts
ads: {
  enabled: true,
  adsenseClient: 'ca-pub-XXXXXXXXXXXXXXXX',
  inContentSlot: '1234567890',
  refreshOnGameEnd: false, // leave off until you've read AdSense refresh policy
},
```

4. Commit, push, redeploy. The `AdSlot` on each game page goes live; the loader
   is added once in the page head only when ads are enabled.

Keep density low (one in-content unit) to protect the experience. When traffic
qualifies (~50k sessions/mo), apply to a premium network like Mediavine for a
2–5× RPM jump — the same `AdSlot` markup works.

---

## 7. (Later) Accounts & cloud sync

See the **Accounts, badges & the business layer** section in `README.md` and
`supabase/schema.sql` for enabling Google sign-in + sync.

---

## Quick reference

| What | Where |
|---|---|
| Build command | `npm run build` |
| Output dir | `dist` |
| Sitemap | `https://cardhearth.com/sitemap-index.xml` |
| Config switches | `src/lib/site-config.ts` |
| Analytics events | `game_won`, `game_lost` (per game/variant) |
| Ad unit | in-content, one per game page |
