---
name: cardhearth-design
description: Use this skill to generate well-branded interfaces and assets for CardHearth (cardhearth.com — a free, fair suite of classic card & puzzle games on green felt), either for production or throwaway prototypes/mocks/decks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy
assets out and create static HTML files for the user to view. If working on
production code, you can copy assets and read the rules here to become an expert
in designing with this brand.

Key starting points:
- `readme.md` — brand context, content/voice rules, visual foundations, iconography, and a full file index.
- `styles.css` + `tokens/` — link `styles.css` to get every color, type, spacing, radius, shadow and motion token (CSS custom properties).
- `guidelines/*.html` — rendered specimen cards for colors, type, spacing, effects and brand.
- `components/` — React primitives (Button, Pill, Badge, Panel, GameCard, Hud, Dialog, Toast). Each has a `.prompt.md` with usage.
- `ui_kits/cardhearth-web/` — a working, interactive recreation of the site (menu → game shell) to copy patterns from.
- `assets/` — logo lockups, app icon, table textures, and a sample of the illustrated "ink" card deck.

Brand in one line: a warm, fair, lamplit **green-felt card table**. Felt green
+ a single **gold** action color, translucent on-felt surfaces with white
hairlines (never opaque blocks), system-sans type at weight 800 for titles,
soft dark shadows that lift on hover, gentle "card-landing" motion, and a
calm, plain-spoken, second-person voice that makes concrete fairness promises.

If the user invokes this skill without any other guidance, ask them what they
want to build or design, ask a few questions, and act as an expert designer who
outputs HTML artifacts _or_ production code, depending on the need.
