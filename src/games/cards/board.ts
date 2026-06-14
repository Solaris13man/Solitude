import {
  RANK_LABELS,
  SUIT_SYMBOLS,
  type Card,
  cardName,
  isRed,
} from './deck';
import { type GameState, type Move, type PileRef, getPile } from './types';

export interface Point {
  x: number;
  y: number;
}

/** Pile counts and presence flags that shape the board for one game. */
export interface BoardConfig {
  tableauCount: number;
  foundationCount: number;
  cellCount: number;
  hasStock: boolean;
  hasWaste: boolean;
  /** Golf: the waste pile is itself the drop/play target. */
  wasteDrop?: boolean;
}

export interface BoardMetrics {
  cardW: number;
  cardH: number;
  gap: number;
  boardW: number;
  boardH: number;
  tableauTop: number;
  fanUp: number;
  fanDown: number;
  wasteFan: number;
  stock: Point;
  waste: Point;
  cells: Point[];
  foundations: Point[];
  tableau: Point[];
}

/** Classic pip positions for number cards: [x%, y%, flipped]. */
const PIP_LAYOUTS: Record<number, [number, number, boolean][]> = {
  2: [[50, 20, false], [50, 80, true]],
  3: [[50, 20, false], [50, 50, false], [50, 80, true]],
  4: [[32, 20, false], [68, 20, false], [32, 80, true], [68, 80, true]],
  5: [[32, 20, false], [68, 20, false], [50, 50, false], [32, 80, true], [68, 80, true]],
  6: [[32, 20, false], [68, 20, false], [32, 50, false], [68, 50, false], [32, 80, true], [68, 80, true]],
  7: [[32, 20, false], [68, 20, false], [50, 35, false], [32, 50, false], [68, 50, false], [32, 80, true], [68, 80, true]],
  8: [[32, 20, false], [68, 20, false], [50, 35, false], [32, 50, false], [68, 50, false], [50, 65, true], [32, 80, true], [68, 80, true]],
  9: [[32, 20, false], [68, 20, false], [32, 40, false], [68, 40, false], [50, 50, false], [32, 60, true], [68, 60, true], [32, 80, true], [68, 80, true]],
  10: [[32, 20, false], [68, 20, false], [50, 30, false], [32, 40, false], [68, 40, false], [32, 60, true], [68, 60, true], [50, 70, true], [32, 80, true], [68, 80, true]],
};

/** The active card-art set (applied to <html> as data-cardset). */
export function currentCardSet(): string {
  if (typeof document === 'undefined') return 'new-blue';
  return document.documentElement.dataset.cardset || 'new-blue';
}

/** Image paths for a card id's face and back in the current set, or null for
 *  the built-in 'classic' drawn deck. */
export function cardArtById(id: string): { face: string; back: string } | null {
  const set = currentCardSet();
  if (set === 'classic') return null;
  // 'ink' sets are single-back hand-drawn decks; the others pair a design with a back colour.
  if (set === 'ink' || set === 'ink-shadow') {
    return { face: `/cards/${set}/${id}.webp`, back: `/cards/${set}/back.webp` };
  }
  const design = set.startsWith('vintage') ? 'vintage' : 'new';
  const color = set.endsWith('red') ? 'red' : 'blue';
  return { face: `/cards/${design}/${id}.webp`, back: `/cards/${design}/back-${color}.webp` };
}

export function cardArt(card: Card): { face: string; back: string } | null {
  return cardArtById(card.id);
}

function makeCardImg(cls: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `card-img ${cls}`;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.width = 400;
  img.height = 554;
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

/** Add/update/remove the premium art layers on one card element to match the
 *  current set. Shared by the main and peaks boards so all card games re-skin
 *  identically on a settings change. */
export function paintCardArt(id: string, el: HTMLElement): void {
  const art = cardArtById(id);
  const front = el.querySelector('.card-front');
  const back = el.querySelector('.card-back');
  let faceImg = el.querySelector<HTMLImageElement>('.card-face-img');
  let backImg = el.querySelector<HTMLImageElement>('.card-back-img');
  if (!art) {
    faceImg?.remove();
    backImg?.remove();
    return;
  }
  if (!faceImg && front) {
    faceImg = makeCardImg('card-face-img');
    front.prepend(faceImg);
  }
  if (faceImg) faceImg.src = art.face;
  if (!backImg && back) {
    backImg = makeCardImg('card-back-img');
    back.appendChild(backImg);
  }
  if (backImg) backImg.src = art.back;
}

function frontMarkup(card: Card): string {
  const sym = SUIT_SYMBOLS[card.suit];
  if (card.rank === 1) {
    return `<span class="pip-ace">${sym}</span>`;
  }
  if (card.rank > 10) {
    return `
      <span class="court-frame"></span>
      <span class="court-letter">${RANK_LABELS[card.rank]}</span>
      <span class="court-suit court-suit-tl">${sym}</span>
      <span class="court-suit court-suit-br">${sym}</span>`;
  }
  const pips = PIP_LAYOUTS[card.rank]!
    .map(
      ([x, y, flip]) =>
        `<span class="pip-spot${flip ? ' pip-flip' : ''}" style="left:${x}%;top:${y}%">${sym}</span>`,
    )
    .join('');
  // The pip field is inset from the card edges so pips never collide with the
  // corner indices.
  return `<span class="pip-field">${pips}</span>`;
}

/** Build the standard card element (front pips + back); shared with the
 *  open-layout (pyramid/peaks) renderer so all games use the same faces. */
export function createCardElement(card: Card): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = card.id;
  const color = isRed(card.suit) ? 'red' : 'black';
  const art = cardArt(card);
  // Premium artwork as <img> layers; if one fails to load it's removed and the
  // drawn pips/back below take over (CSS :has() hides them only while present).
  const faceImg = art ? `<img class="card-img card-face-img" alt="" draggable="false" decoding="async" width="400" height="554" src="${art.face}">` : '';
  const backImg = art ? `<img class="card-img card-back-img" alt="" draggable="false" decoding="async" width="400" height="554" src="${art.back}">` : '';
  el.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front card-${color}" aria-hidden="true">
        ${faceImg}
        <span class="corner corner-tl"><b>${RANK_LABELS[card.rank]}</b><i>${SUIT_SYMBOLS[card.suit]}</i></span>
        ${frontMarkup(card)}
        <span class="corner corner-br"><b>${RANK_LABELS[card.rank]}</b><i>${SUIT_SYMBOLS[card.suit]}</i></span>
      </div>
      <div class="card-face card-back" aria-hidden="true">${backImg}</div>
    </div>`;
  for (const img of el.querySelectorAll<HTMLImageElement>('img.card-img')) {
    img.addEventListener('error', () => img.remove(), { once: true });
  }
  return el;
}

export interface BoardOptions {
  leftHand: boolean;
  /** Game-specific pickup rule; drives the movable/focusable styling. */
  canPick?: (ref: PileRef, depth: number) => boolean;
}

/**
 * Owns the board DOM: one persistent element per card, positioned with
 * `transform: translate3d`, so every state change animates via a single CSS
 * transition. Layout is computed from the container width on each render.
 */
export class Board {
  readonly container: HTMLElement;
  metrics!: BoardMetrics;
  private cardEls = new Map<string, HTMLElement>();
  private slotEls = new Map<string, HTMLElement>();
  private state: GameState | null = null;
  private positions = new Map<string, Point>();
  private options: BoardOptions = { leftHand: false };
  private zResetTimers = new Map<string, number>();
  private dropHintEl: HTMLElement | null = null;
  private dropHintKey: string | null = null;

  readonly config: BoardConfig;

  constructor(container: HTMLElement, config: BoardConfig) {
    this.container = container;
    this.config = config;
    this.computeMetrics();
    this.mountSlots();
  }

  setOptions(options: BoardOptions): void {
    this.options = options;
  }

  /** Re-skin every card to the current card-art set (called on settings
   *  change). Adds/updates/removes the premium <img> layers in place. */
  applyCardArt(): void {
    for (const [id, el] of this.cardEls) paintCardArt(id, el);
  }

  private mirror(x: number): number {
    if (!this.options.leftHand) return x;
    return this.metrics.boardW - this.metrics.cardW - x;
  }

  computeMetrics(): void {
    const cfg = this.config;
    const n = cfg.tableauCount;
    // Measure the scroll wrapper (parent) so a previously widened board
    // doesn't feed back into its own layout.
    const availW = this.container.parentElement?.clientWidth || this.container.clientWidth;
    let gap = Math.max(4, Math.round(availW * 0.012));
    let cardW = Math.floor((availW - gap * (n - 1)) / n);
    let boardW = availW;
    // Touch floor: never shrink cards below a usable size (Spider's ten
    // columns on a phone). The board grows instead and pans horizontally.
    const MIN_CARD_W = 44;
    if (cardW < MIN_CARD_W) {
      cardW = MIN_CARD_W;
      gap = 4;
      boardW = n * cardW + (n - 1) * gap;
      this.container.style.width = `${boardW}px`;
    } else {
      this.container.style.width = '';
    }
    const cardH = Math.round(cardW * 1.4);
    const tableauTop = cardH + Math.round(gap * 2.5);
    const viewportAvail = Math.max(window.innerHeight - 220, 360);
    const fanSpace = Math.min(
      Math.max(viewportAvail - tableauTop - cardH, cardH * 1.4),
      cardH * 3.4,
    );
    const boardH = tableauTop + cardH + fanSpace;

    const colX = (i: number) => i * (cardW + gap);
    // Top row: stock, waste, cells on the left; foundations right-aligned.
    const cellStart = (cfg.hasStock ? 1 : 0) + (cfg.hasWaste ? 1 : 0);
    this.metrics = {
      cardW,
      cardH,
      gap,
      boardW,
      boardH,
      tableauTop,
      fanUp: Math.round(cardH * 0.27),
      fanDown: Math.round(cardH * 0.14),
      wasteFan: Math.round(cardW * 0.24),
      stock: { x: colX(0), y: 0 },
      waste: { x: colX(1), y: 0 },
      cells: Array.from({ length: cfg.cellCount }, (_, i) => ({ x: colX(cellStart + i), y: 0 })),
      foundations: Array.from({ length: cfg.foundationCount }, (_, i) => ({
        x: colX(n - cfg.foundationCount + i),
        y: 0,
      })),
      tableau: Array.from({ length: n }, (_, i) => ({ x: colX(i), y: tableauTop })),
    };
    this.container.style.height = `${boardH}px`;
    this.container.style.setProperty('--card-w', `${cardW}px`);
    this.container.style.setProperty('--card-h', `${cardH}px`);
  }

  private mountSlots(): void {
    const make = (key: string, label: string, extraClass = ''): HTMLElement => {
      const el = document.createElement('div');
      el.className = `slot ${extraClass}`.trim();
      el.dataset.slot = key;
      el.setAttribute('aria-label', label);
      this.container.appendChild(el);
      this.slotEls.set(key, el);
      return el;
    };
    const cfg = this.config;
    if (cfg.hasStock) {
      const stock = make('stock', 'Stock. Activate to draw.', 'slot-stock');
      stock.setAttribute('role', 'button');
      stock.tabIndex = 0;
      stock.innerHTML = '<span class="slot-glyph" aria-hidden="true">↺</span>';
    }
    if (cfg.hasWaste) make('waste', 'Waste pile');
    for (let i = 0; i < cfg.cellCount; i++) {
      make(`cell-${i}`, `Free cell ${i + 1}`, 'slot-cell');
    }
    for (let i = 0; i < cfg.foundationCount; i++) {
      const el = make(`foundation-${i}`, `Foundation ${i + 1}`, 'slot-foundation');
      el.innerHTML = '<span class="slot-glyph" aria-hidden="true">A</span>';
    }
    for (let i = 0; i < cfg.tableauCount; i++) {
      make(`tableau-${i}`, `Tableau column ${i + 1}`);
    }
    this.layoutSlots();
  }

  private layoutSlots(): void {
    const m = this.metrics;
    const place = (key: string, p: Point) => {
      const el = this.slotEls.get(key);
      if (el) el.style.transform = `translate3d(${this.mirror(p.x)}px, ${p.y}px, 0)`;
    };
    place('stock', m.stock);
    place('waste', m.waste);
    m.cells.forEach((p, i) => place(`cell-${i}`, p));
    m.foundations.forEach((p, i) => place(`foundation-${i}`, p));
    m.tableau.forEach((p, i) => place(`tableau-${i}`, p));
  }

  slotElement(key: string): HTMLElement | undefined {
    return this.slotEls.get(key);
  }

  cardElement(id: string): HTMLElement | undefined {
    return this.cardEls.get(id);
  }

  positionOf(id: string): Point {
    return this.positions.get(id) ?? { x: 0, y: 0 };
  }

  private ensureCardEl(card: Card): HTMLElement {
    let el = this.cardEls.get(card.id);
    if (el) return el;
    el = createCardElement(card);
    this.container.appendChild(el);
    this.cardEls.set(card.id, el);
    return el;
  }

  setState(state: GameState): void {
    this.state = state;
  }

  /** Reposition every card from the current state. */
  render(): void {
    const state = this.state;
    if (!state) return;
    const m = this.metrics;
    let z = 1;

    this.setDropHint(null);

    const place = (card: Card, p: Point, ref: PileRef, depth: number, movable: boolean) => {
      const el = this.ensureCardEl(card);
      el.style.visibility = ''; // the win cascade hides exited cards
      const x = this.mirror(p.x);
      const prev = this.positions.get(card.id);
      const moved = !!prev && (Math.abs(prev.x - x) > 1 || Math.abs(prev.y - p.y) > 1);
      el.style.transform = `translate3d(${x}px, ${p.y}px, 0)`;
      const baseZ = z++;
      el.style.zIndex = String(baseZ);
      // Cards travelling to a new pile glide above everything else for the
      // duration of the transition, instead of sliding under taller piles.
      if (moved && !el.classList.contains('dragging')) {
        el.style.zIndex = String(1000 + baseZ);
        const pending = this.zResetTimers.get(card.id);
        if (pending) window.clearTimeout(pending);
        this.zResetTimers.set(
          card.id,
          window.setTimeout(() => {
            el.style.zIndex = String(baseZ);
            this.zResetTimers.delete(card.id);
          }, 430),
        );
      }
      el.classList.toggle('face-up', card.faceUp);
      el.classList.toggle('movable', movable);
      el.dataset.kind = ref.kind;
      el.dataset.pile = String(ref.index);
      el.dataset.depth = String(depth);
      this.positions.set(card.id, { x, y: p.y });
      if (movable) {
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', cardName(card));
      } else {
        el.tabIndex = -1;
        el.removeAttribute('role');
        if (card.faceUp) el.setAttribute('aria-label', cardName(card));
        else el.setAttribute('aria-label', 'face-down card');
      }
    };

    state.stock.forEach((card, i) => {
      // Slight stepped offset so a full stock visibly has depth.
      const lift = Math.min(3, Math.floor(i / 8));
      const p = { x: m.stock.x - lift, y: m.stock.y - lift };
      place(card, p, { kind: 'stock', index: 0 }, state.stock.length - 1 - i, false);
    });

    const pickable = (ref: PileRef, depth: number, fallback: boolean): boolean =>
      this.options.canPick ? this.options.canPick(ref, depth) : fallback;

    const wn = state.waste.length;
    state.waste.forEach((card, i) => {
      const fanIdx = state.game === 'klondike' && state.variant === 3 ? Math.max(0, i - (wn - 3)) : 0;
      const p = { x: m.waste.x + fanIdx * m.wasteFan, y: m.waste.y };
      const ref: PileRef = { kind: 'waste', index: 0 };
      place(card, p, ref, wn - 1 - i, i === wn - 1 && pickable(ref, 0, true));
    });

    state.cells.forEach((pile, ci) => {
      const ref: PileRef = { kind: 'cell', index: ci };
      pile.forEach((card, i) => {
        place(card, m.cells[ci]!, ref, pile.length - 1 - i, i === pile.length - 1 && pickable(ref, 0, true));
      });
    });

    state.foundations.forEach((pile, fi) => {
      const ref: PileRef = { kind: 'foundation', index: fi };
      pile.forEach((card, i) => {
        place(card, m.foundations[fi]!, ref, pile.length - 1 - i, i === pile.length - 1 && pickable(ref, 0, true));
      });
    });

    state.tableau.forEach((pile, ti) => {
      const base = m.tableau[ti]!;
      const faceDown = pile.filter((c) => !c.faceUp).length;
      const faceUp = pile.length - faceDown;
      // Compress fan offsets when a tall pile would overflow the board.
      const avail = m.boardH - m.tableauTop - m.cardH;
      const need = faceDown * m.fanDown + Math.max(0, faceUp - 1) * m.fanUp;
      const scale = need > avail ? avail / need : 1;
      let y = base.y;
      const ref: PileRef = { kind: 'tableau', index: ti };
      pile.forEach((card, i) => {
        const depth = pile.length - 1 - i;
        place(card, { x: base.x, y }, ref, depth, pickable(ref, depth, card.faceUp));
        y += (card.faceUp ? m.fanUp : m.fanDown) * scale;
      });
    });

    // Stock slot doubles as the recycle button.
    const stockSlot = this.slotEls.get('stock');
    if (stockSlot) {
      const canRecycleNow =
        state.game === 'klondike' && state.stock.length === 0 && state.waste.length > 0;
      stockSlot.classList.toggle('recyclable', canRecycleNow);
      stockSlot.setAttribute(
        'aria-label',
        state.stock.length > 0
          ? `Stock, ${state.stock.length} cards. Activate to draw.`
          : canRecycleNow
            ? 'Stock empty. Activate to recycle the waste pile.'
            : 'Stock empty.',
      );
    }
  }

  /** Re-layout after a container resize. */
  resize(): void {
    this.computeMetrics();
    this.layoutSlots();
    this.render();
  }

  /** Identify a card element's pile reference and depth-from-top. */
  refOf(el: HTMLElement): { ref: PileRef; depth: number } | null {
    const kind = el.dataset.kind as PileRef['kind'] | undefined;
    if (!kind) return null;
    return {
      ref: { kind, index: Number(el.dataset.pile ?? 0) },
      depth: Number(el.dataset.depth ?? 0),
    };
  }

  /** Which pile a board-relative point falls on (for drops). */
  dropTargetAt(x: number, y: number): PileRef | null {
    const cfg = this.config;
    const m = this.metrics;
    const n = cfg.tableauCount;
    const stride = m.cardW + m.gap;
    const physical = Math.min(n - 1, Math.max(0, Math.floor((x + m.gap / 2) / stride)));
    const col = this.options.leftHand ? n - 1 - physical : physical;
    if (y < m.tableauTop - m.gap) {
      // Top row: cells and foundations accept drops; stock/waste usually
      // don't (Golf opts the waste in).
      if (cfg.wasteDrop && cfg.hasWaste && col === 1) return { kind: 'waste', index: 0 };
      const fStart = n - cfg.foundationCount;
      if (cfg.foundationCount > 0 && col >= fStart) {
        return { kind: 'foundation', index: col - fStart };
      }
      const cellStart = (cfg.hasStock ? 1 : 0) + (cfg.hasWaste ? 1 : 0);
      const cellIdx = col - cellStart;
      if (cellIdx >= 0 && cellIdx < cfg.cellCount) return { kind: 'cell', index: cellIdx };
      return null;
    }
    return { kind: 'tableau', index: col };
  }

  /** Convert client (viewport) coordinates to board-relative coordinates. */
  toBoardCoords(clientX: number, clientY: number): Point {
    const rect = this.container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /** The elements of the run being moved: `count` cards from the top of `ref`'s pile. */
  runElements(state: GameState, ref: PileRef, count: number): HTMLElement[] {
    const pile = getPile(state, ref);
    return pile
      .slice(pile.length - count)
      .map((c) => this.cardEls.get(c.id))
      .filter((el): el is HTMLElement => !!el);
  }

  /**
   * Live feedback while dragging: outline the pile the run would drop onto.
   * Pass null to clear. No-ops when the target hasn't changed.
   */
  setDropHint(ref: PileRef | null): void {
    const key = ref ? `${ref.kind}-${ref.index}` : null;
    if (key === this.dropHintKey) return;
    this.dropHintEl?.classList.remove('drop-ok');
    this.dropHintEl = null;
    this.dropHintKey = key;
    if (!ref || !this.state) return;
    const pile = getPile(this.state, ref);
    const topCard = pile[pile.length - 1];
    const slotKey = ref.kind === 'waste' ? 'waste' : `${ref.kind}-${ref.index}`;
    const el = topCard ? this.cardEls.get(topCard.id) : this.slotEls.get(slotKey);
    if (el) {
      el.classList.add('drop-ok');
      this.dropHintEl = el;
    }
  }

  /** Wiggle a card that has nowhere to go (invalid tap feedback). */
  shakeCard(id: string): void {
    const el = this.cardEls.get(id);
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    window.setTimeout(() => el.classList.remove('shake'), 350);
  }

  /** Briefly highlight the elements involved in a move (hint display). */
  highlightMove(move: Move, state: GameState): void {
    const els: HTMLElement[] = [];
    if (move.type === 'draw' || move.type === 'recycle') {
      const slot = this.slotEls.get('stock');
      if (slot) els.push(slot);
      els.push(...this.runElements(state, { kind: 'stock', index: 0 }, Math.min(1, state.stock.length)));
    } else {
      els.push(...this.runElements(state, move.from, move.count));
      const toPile = getPile(state, move.to);
      if (toPile.length > 0) {
        const el = this.cardEls.get(toPile[toPile.length - 1]!.id);
        if (el) els.push(el);
      } else {
        const slotKey = move.to.kind === 'waste' ? 'waste' : `${move.to.kind}-${move.to.index}`;
        const slot = this.slotEls.get(slotKey);
        if (slot) els.push(slot);
      }
    }
    for (const el of els) {
      el.classList.remove('hint');
      // Restart the animation if the same element is hinted twice.
      void el.offsetWidth;
      el.classList.add('hint');
      window.setTimeout(() => el.classList.remove('hint'), 1600);
    }
  }

  /** Remove all card elements (used when starting a fresh deal). */
  reset(): void {
    for (const el of this.cardEls.values()) el.remove();
    this.cardEls.clear();
    this.positions.clear();
  }
}
