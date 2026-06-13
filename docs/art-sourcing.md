# Art sourcing shortlist (buy → hand to Claude → integrate)

Researched June 2026. Buy/download what you like, then give me the files
(a zip like the Mahjong one) and I'll wire them in — cards get an
image-based renderer + a design picker (re-skins all 6 card games at once),
felt becomes the table background, Minesweeper/2048 get tile art in their
renderers, and a UI kit upgrades the menu + buttons.

> **Licensing rule for CardHearth (ad-supported = commercial):** only use
> assets that are **CC0** or explicitly **"commercial use allowed."** All
> picks below qualify. AVOID CC-BY-SA / LGPL card sets (e.g. the classic
> David Bellot SVG cards) — the share-alike/attribution terms aren't worth it.
> Stock-photo textures require buying a standard royalty-free license per image.

---

## 1. Playing cards — TOP PRIORITY (one renderer powers Klondike, Spider, FreeCell, Pyramid, TriPeaks, Golf)

I need a full **52 faces + at least one back**; if a pack has multiple
designs I'll add a card-design picker (like the card-back picker today).

- **Best for style consistency — same seller as your Mahjong set:**
  Royal Graphics Resources, "Playing Cards" pack (~$2.50; vintage + modern
  decks; PNG + EPS + sounds). Matches the Mahjong art. → https://royalgraphicsresources.itch.io/
- **Cleanest standard faces (great legibility when small):**
  Chequered Ink, "Card Games Graphics Pack" — 52 fronts + 3 jokers, 800×1080
  PNG, "ANY and ALL uses including commercial." → https://ci.itch.io/card-games-graphics-pack
- **Free / CC0 fallback:** MrEliptik, "Playing Cards Packs (52 Cards)" — CC0.
  → https://mreliptik.itch.io/playing-cards-packs-52-cards
- **3D-look option:** AarniTuli, "Ultimate 3D Playing Card Asset Pack" —
  commercial + non-commercial. → https://aarnituli.itch.io/card-game-asset-pack

> Legibility matters most here: a deck rendered at ~44px wide on phones must
> stay readable, so a purpose-built card pack beats ornate art. The Royal
> Graphics or Chequered Ink sets are the safe bets.

## 2. Table background / felt (every game's backdrop)

One **seamless/tileable** felt image per color is all I need; I'll swap the
flat CSS gradient for it and can tie it to the existing felt-color setting.

- Stock seamless felt (buy one royalty-free image, ~$10–15):
  iStock / Dreamstime / Shutterstock — search "seamless poker felt texture."
  → https://www.istockphoto.com/photos/poker-felt-table-textured-effect
- Or game-asset backgrounds: CraftPix (no commercial restrictions).
  → https://craftpix.net/

## 3. Minesweeper & 2048

- **Minesweeper** (need: covered tile, revealed tile, flag, mine; numbers can
  stay as text or come from the pack): itch.io Minesweeper-tagged packs such as
  "Micro Classics – Minesweeper [16×16 & 8×8]" / "Minesweeper Tiles."
  → https://itch.io/game-assets/tag-minesweeper
- **2048** (rounded numbered tiles): "2048 Number Merge Puzzle Style Asset Pack."
  → https://itch.io/game-assets/genre-puzzle/tag-2048
  (Honest note: 2048 already looks decent in pure CSS — a nicer tile style +
  the UI kit below may be enough; lowest priority of the four.)

## 4. Menu / home + in-game UI polish

- **CraftPix "Casual UI Vector Game Asset Pack"** — buttons, headers, icons,
  panels, rating stars, vector, commercial OK. Great for the landing-page game
  thumbnails and the in-game button bar. → https://craftpix.net/product/casual-ui-vector-game-asset-pack/

---

## Recommended buy order (most lift per dollar)

1. **A playing-card pack** (Royal Graphics for consistency, or Chequered Ink) — transforms 6 games.
2. **One seamless felt texture** — instantly lifts every screen.
3. The **CraftPix Casual UI** kit — menu + buttons.
4. Minesweeper tiles, then (optional) 2048 tiles.

Hand me whatever you grab and I'll integrate it the same way as the Mahjong art.
