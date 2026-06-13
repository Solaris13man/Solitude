# Turning on Ads (AdSense) and Accounts (Supabase)

Both layers are already built into the site and gated behind flags in
`src/lib/site-config.ts`. You do the dashboard setup and hand me the IDs/keys
(or edit the config yourself); then it goes live on the next deploy.

The config block you're filling in:

```ts
// src/lib/site-config.ts
ads: {
  enabled: false,            // → true once approved
  adsenseClient: '',         // 'ca-pub-XXXXXXXXXXXXXXXX'
  inContentSlot: '',         // the numeric ad-unit slot id
  refreshOnGameEnd: false,   // leave false (see note)
},
accounts: {
  enabled: false,            // → true once Supabase is set up
  supabaseUrl: '',           // 'https://xxxxxxxx.supabase.co'
  supabaseAnonKey: '',       // the anon / publishable key (safe in the browser)
},
```

---

## Part 1 — Google AdSense

> Reality check: AdSense approval generally wants a site with real content and
> at least some traffic. You have the content; if you apply with near-zero
> traffic you may get "low value content" and have to reapply after the
> outreach brings visitors. That's normal — don't take a first rejection as final.

1. **Apply.** Go to <https://adsense.google.com>, sign in with your Google
   account, and add `cardhearth.com` as a site. You'll be given a **publisher
   ID** that looks like `ca-pub-1234567890123456`.
2. **Verify ownership.** AdSense asks you to put its script in your site's
   `<head>`. The site already does this automatically once ads are switched on,
   so: set `adsenseClient` to your `ca-pub-…` id and `enabled: true`, deploy,
   then click **Verify** in AdSense. (Belt-and-suspenders: also add an
   `ads.txt` — see step 5.)
3. **Wait for review.** Google reviews the site (a few days to a couple of
   weeks). Keep the games working and the content up.
4. **Create an ad unit.** Once approved: AdSense → **Ads → By ad unit → Display
   ads** (or "In-article"). Name it (e.g. "CardHearth in-content"), create it,
   and copy the **slot id** — the long number in the unit's code (`data-ad-slot`).
   Put that number in `inContentSlot`.
5. **Add `ads.txt`** at the site root so AdSense trusts your inventory. Create
   `public/ads.txt` containing exactly (with your own pub id):
   ```
   google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0
   ```
   (Note: `pub-…`, not `ca-pub-…`, in ads.txt.) It'll be served at
   `https://cardhearth.com/ads.txt`.
6. **Deploy.** The `<AdSlot>` component renders the real ad once `enabled` is
   true and both ids are set; until then it shows a labelled placeholder only
   if `showAdPlaceholders` is on.

**Note on `refreshOnGameEnd`:** leave it `false`. AdSense forbids auto/timed
refresh; refreshing on a finished game is borderline and not worth the risk on
a new account. Revisit only once you're established.

**Hand me:** your `ca-pub-…` id and the slot number — I'll set the three `ads`
fields and add `public/ads.txt`. (Or set them yourself.)

---

## Part 2 — Supabase accounts (Google sign-in + cloud sync)

This enables real Google login and cross-device syncing of stats, streaks and
badges. The database schema is already written at `supabase/schema.sql`.

1. **Create a project.** Go to <https://supabase.com> → new project (free tier
   is fine). Pick a region near your players and set a database password.
2. **Create the table + security.** In the project, open **SQL Editor**, paste
   the entire contents of `supabase/schema.sql`, and run it. This creates a
   `profiles` table (one JSON row per user) with row-level security so each
   signed-in user can only read/write their own row — which is why the public
   anon key is safe in the browser.
3. **Set up Google as an OAuth provider.** This has two halves:
   - **Google Cloud Console** (<https://console.cloud.google.com>): create an
     OAuth consent screen, then **Credentials → Create credentials → OAuth client
     ID → Web application**. For **Authorized redirect URI**, paste the callback
     URL Supabase shows you on its Google provider page — it looks like
     `https://<your-project-ref>.supabase.co/auth/v1/callback`. Save, then copy
     the **Client ID** and **Client secret**.
   - **Supabase**: **Authentication → Providers → Google** → enable it and paste
     that Client ID + secret.
4. **Set the URL allow-list.** Supabase **Authentication → URL Configuration**:
   - **Site URL:** `https://cardhearth.com`
   - **Redirect URLs:** add `https://cardhearth.com/**` (and, if you want to
     test on the preview domain, your `https://<project>.pages.dev/**` too).
   The site sends users back to whatever page they signed in from, so allow the
   whole origin with the `/**` wildcard.
5. **Grab your keys.** Supabase **Project Settings → API**: copy the **Project
   URL** (`https://xxxx.supabase.co`) and the **anon / public** key.
6. **Wire it up.** Put those into `accounts.supabaseUrl` and
   `accounts.supabaseAnonKey`, set `accounts.enabled: true`, and deploy.
7. **Test.** Open `/account/`, click **Sign in with Google**. You should bounce
   to Google, come back signed in, and your local stats/badges should sync up.
   The `/profile/` page then reflects synced data, and the "sign in to sync"
   notes activate.

**Hand me:** the **Project URL** and the **anon key** — I'll fill the three
`accounts` fields and flip `enabled`. (You must create the Google OAuth client
yourself; I can't do that part.)

---

## Suggested order

- **Supabase now** — no approval gate, immediately improves retention and makes
  the `/profile/` page and (eventually) honest global counts possible.
- **AdSense after the outreach** has brought some traffic, so approval sticks.
