import {
  RANK_LABELS,
  SUIT_SYMBOLS,
  type Card,
  cardName,
  isRed,
} from '../engine/deck';
import type { GameState, Move, PileRef } from '../engine/klondike';

export interface Point {
  x: number;
  y: number;
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
  return PIP_LAYOUTS[card.rank]!
    .map(
      ([x, y, flip]) =>
        `<span class="pip-spot${flip ? ' pip-flip' : ''}" style="left:${x}%;top:${y}%">${sym}</span>`,
    )
    .join('');
}

export interface BoardOptions {
  leftHand: boolean;
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

  constructor(container: HTMLElement) {
    this.container = container;
    this.computeMetrics();
    this.mountSlots();
  }

  setOptions(options: BoardOptions): void {
    this.options = options;
  }

  private mirror(x: number): number {
    if (!this.options.leftHand) return x;
    return this.metrics.boardW - this.metrics.cardW - x;
  }

  computeMetrics(): void {
    const boardW = this.container.clientWidth;
    const gap = Math.max(4, Math.round(boardW * 0.012));
    const cardW = Math.floor((boardW - gap * 6) / 7);
    const cardH = Math.round(cardW * 1.4);
    const tableauTop = cardH + Math.round(gap * 2.5);
    const viewportAvail = Math.max(window.innerHeight - 220, 360);
    const fanSpace = Math.min(
      Math.max(viewportAvail - tableauTop - cardH, cardH * 1.4),
      cardH * 3.4,
    );
    const boardH = tableauTop + cardH + fanSpace;

    const colX = (i: number) => i * (cardW + gap);
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
      foundations: [3, 4, 5, 6].map((i) => ({ x: colX(i), y: 0 })),
      tableau: Array.from({ length: 7 }, (_, i) => ({ x: colX(i), y: tableauTop })),
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
    const stock = make('stock', 'Stock. Activate to draw.', 'slot-stock');
    stock.setAttribute('role', 'button');
    stock.tabIndex = 0;
    stock.innerHTML = '<span class="slot-glyph" aria-hidden="true">↺</span>';
    make('waste', 'Waste pile');
    for (let i = 0; i < 4; i++) {
      const el = make(`foundation-${i}`, `Foundation ${i + 1}`, 'slot-foundation');
      el.innerHTML = '<span class="slot-glyph" aria-hidden="true">A</span>';
    }
    for (let i = 0; i < 7; i++) {
      make(`tableau-${i}`, `Tableau column ${i + 1}`);
    }
    this.layoutSlots();
  }

  private layoutSlots(): void {
    const m = this.metrics;
    const place = (key: string, p: Point) => {
      const el = this.slotEls.get(key)!;
      el.style.transform = `translate3d(${this.mirror(p.x)}px, ${p.y}px, 0)`;
    };
    place('stock', m.stock);
    place('waste', m.waste);
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
    el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = card.id;
    const color = isRed(card.suit) ? 'red' : 'black';
    el.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-front card-${color}" aria-hidden="true">
          <span class="corner corner-tl"><b>${RANK_LABELS[card.rank]}</b><i>${SUIT_SYMBOLS[card.suit]}</i></span>
          ${frontMarkup(card)}
          <span class="corner corner-br"><b>${RANK_LABELS[card.rank]}</b><i>${SUIT_SYMBOLS[card.suit]}</i></span>
        </div>
        <div class="card-face card-back" aria-hidden="true"></div>
      </div>`;
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
          }, 280),
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

    const wn = state.waste.length;
    state.waste.forEach((card, i) => {
      const fanIdx = state.drawMode === 3 ? Math.max(0, i - (wn - 3)) : 0;
      const p = { x: m.waste.x + fanIdx * m.wasteFan, y: m.waste.y };
      place(card, p, { kind: 'waste', index: 0 }, wn - 1 - i, i === wn - 1);
    });

    state.foundations.forEach((pile, fi) => {
      pile.forEach((card, i) => {
        place(card, m.foundations[fi]!, { kind: 'foundation', index: fi }, pile.length - 1 - i, i === pile.length - 1);
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
      pile.forEach((card, i) => {
        const movable = card.faceUp;
        place(card, { x: base.x, y }, { kind: 'tableau', index: ti }, pile.length - 1 - i, movable);
        y += (card.faceUp ? m.fanUp : m.fanDown) * scale;
      });
    });

    // Stock slot doubles as the recycle button.
    const stockSlot = this.slotEls.get('stock')!;
    const canRecycleNow = state.stock.length === 0 && state.waste.length > 0;
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
    const m = this.metrics;
    const inColumnOf = (px: number): number => {
      const stride = m.cardW + m.gap;
      const col = Math.floor((px + m.gap / 2) / stride);
      return Math.min(6, Math.max(0, col));
    };
    const col = inColumnOf(x);
    if (y < m.tableauTop - m.gap) {
      // Top row: only foundations accept drops.
      const fCols = [3, 4, 5, 6];
      const idx = fCols.indexOf(this.options.leftHand ? 6 - col : col);
      if (idx >= 0) return { kind: 'foundation', index: idx };
      return null;
    }
    return { kind: 'tableau', index: this.options.leftHand ? 6 - col : col };
  }

  /** Convert client (viewport) coordinates to board-relative coordinates. */
  toBoardCoords(clientX: number, clientY: number): Point {
    const rect = this.container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /** The elements of the run being moved: `count` cards from the top of `ref`'s pile. */
  runElements(state: GameState, ref: PileRef, count: number): HTMLElement[] {
    const pile =
      ref.kind === 'waste' ? state.waste
      : ref.kind === 'foundation' ? state.foundations[ref.index]!
      : ref.kind === 'tableau' ? state.tableau[ref.index]!
      : state.stock;
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
    const pile =
      ref.kind === 'foundation' ? this.state.foundations[ref.index]! : this.state.tableau[ref.index]!;
    const topCard = pile[pile.length - 1];
    const el = topCard
      ? this.cardEls.get(topCard.id)
      : this.slotEls.get(ref.kind === 'foundation' ? `foundation-${ref.index}` : `tableau-${ref.index}`);
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
      const toPile =
        move.to.kind === 'foundation' ? state.foundations[move.to.index]! : state.tableau[move.to.index]!;
      if (toPile.length > 0) {
        const el = this.cardEls.get(toPile[toPile.length - 1]!.id);
        if (el) els.push(el);
      } else {
        const slot = this.slotEls.get(
          move.to.kind === 'foundation' ? `foundation-${move.to.index}` : `tableau-${move.to.index}`,
        );
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
