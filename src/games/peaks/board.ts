import { createCardElement } from '../cards/board';
import { type Card, cardName } from '../cards/deck';
import type { PeaksRules, PeaksState, Target } from './types';

/**
 * Renderer for formation games (Pyramid, TriPeaks): every card is a
 * persistent element positioned by transform, with the stock and waste in a
 * row beneath the formation. Tap-only — no dragging.
 */
export class PeaksBoard {
  readonly container: HTMLElement;
  private rules: PeaksRules;
  private onTap: (target: Target | 'stock') => void;
  private cardEls = new Map<string, HTMLElement>();
  private stockSlot!: HTMLElement;
  private wasteSlot!: HTMLElement;
  private cardW = 60;
  private cardH = 84;

  constructor(container: HTMLElement, rules: PeaksRules, onTap: (t: Target | 'stock') => void) {
    this.container = container;
    this.rules = rules;
    this.onTap = onTap;
    container.classList.add('peaks-host');
    this.mountSlots();
    this.computeMetrics();
    window.addEventListener('resize', () => this.computeMetrics());
    container.addEventListener('click', (e) => this.handleClick(e));
  }

  private mountSlots(): void {
    this.stockSlot = document.createElement('div');
    this.stockSlot.className = 'slot slot-stock';
    this.stockSlot.dataset.slot = 'stock';
    this.stockSlot.setAttribute('role', 'button');
    this.stockSlot.tabIndex = 0;
    this.stockSlot.innerHTML = '<span class="slot-glyph" aria-hidden="true">↺</span>';
    this.stockSlot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onTap('stock');
      }
    });
    this.wasteSlot = document.createElement('div');
    this.wasteSlot.className = 'slot';
    this.wasteSlot.dataset.slot = 'waste';
    this.wasteSlot.setAttribute('aria-label', 'Waste pile');
    this.container.append(this.stockSlot, this.wasteSlot);
  }

  computeMetrics(): void {
    const availW = this.container.clientWidth || 700;
    this.cardW = Math.min(Math.floor(availW / this.rules.layoutWidth), 96);
    this.cardH = Math.round(this.cardW * 1.4);
    const formationH = this.rules.layoutHeight * this.cardH;
    const boardH = formationH + this.cardH * 0.35 + this.cardH;
    this.container.style.height = `${Math.ceil(boardH)}px`;
    this.container.style.setProperty('--card-w', `${this.cardW}px`);
    this.container.style.setProperty('--card-h', `${this.cardH}px`);
    this.placeSlots();
  }

  private originX(): number {
    const availW = this.container.clientWidth || 700;
    return Math.max(0, (availW - this.rules.layoutWidth * this.cardW) / 2);
  }

  private slotY(): number {
    return this.rules.layoutHeight * this.cardH + this.cardH * 0.35;
  }

  private placeSlots(): void {
    const availW = this.container.clientWidth || 700;
    const cx = availW / 2;
    const y = this.slotY();
    this.stockSlot.style.transform = `translate3d(${cx - this.cardW - 8}px, ${y}px, 0)`;
    this.wasteSlot.style.transform = `translate3d(${cx + 8}px, ${y}px, 0)`;
  }

  private ensureCardEl(card: Card): HTMLElement {
    let el = this.cardEls.get(card.id);
    if (el) return el;
    el = createCardElement(card);
    this.container.appendChild(el);
    this.cardEls.set(card.id, el);
    return el;
  }

  render(state: PeaksState, selected: Target | null): void {
    const ox = this.originX();
    const availW = this.container.clientWidth || 700;
    const cx = availW / 2;
    const slotY = this.slotY();

    state.cells.forEach((cell, i) => {
      const el = this.ensureCardEl(cell.card);
      const pos = this.rules.layout[i]!;
      if (cell.removed && !state.waste.some((w) => w.id === cell.card.id)) {
        // pyramid-style removal: fade out in place
        el.classList.add('peaks-removed');
        el.tabIndex = -1;
        return;
      }
      if (cell.removed) return; // rendered by the waste loop below
      el.classList.remove('peaks-removed');
      el.style.transform = `translate3d(${ox + pos.x * this.cardW}px, ${pos.y * this.cardH}px, 0)`;
      el.style.zIndex = String(10 + Math.round(pos.y * 10));
      const exposed = this.rules.isExposed(state, i);
      el.classList.toggle('face-up', cell.card.faceUp);
      el.classList.toggle('movable', exposed);
      el.classList.toggle(
        'peaks-selected',
        selected?.kind === 'cell' && selected.index === i,
      );
      el.dataset.target = `cell-${i}`;
      el.tabIndex = exposed ? 0 : -1;
      if (exposed) el.setAttribute('role', 'button');
      el.setAttribute(
        'aria-label',
        cell.card.faceUp ? cardName(cell.card) : 'face-down card',
      );
    });

    state.stock.forEach((card, i) => {
      const el = this.ensureCardEl(card);
      el.classList.remove('peaks-removed', 'movable', 'peaks-selected');
      const lift = Math.min(3, Math.floor(i / 6));
      el.style.transform = `translate3d(${cx - this.cardW - 8 - lift}px, ${slotY - lift}px, 0)`;
      el.style.zIndex = String(100 + i);
      el.classList.toggle('face-up', false);
      el.dataset.target = 'stock';
      el.tabIndex = -1;
      el.setAttribute('aria-label', 'stock card');
    });

    state.waste.forEach((card, i) => {
      const el = this.ensureCardEl(card);
      el.classList.remove('peaks-removed');
      el.style.transform = `translate3d(${cx + 8}px, ${slotY}px, 0)`;
      el.style.zIndex = String(200 + i);
      el.classList.add('face-up');
      const isTop = i === state.waste.length - 1;
      el.classList.toggle('movable', isTop && this.rules.pairing);
      el.classList.toggle(
        'peaks-selected',
        isTop && selected?.kind === 'waste',
      );
      el.dataset.target = isTop ? 'waste' : '';
      el.tabIndex = isTop && this.rules.pairing ? 0 : -1;
    });

    this.stockSlot.classList.toggle('recyclable', this.rules.canRecycle(state));
    this.stockSlot.setAttribute(
      'aria-label',
      state.stock.length > 0
        ? `Stock, ${state.stock.length} cards. Activate to draw.`
        : this.rules.canRecycle(state)
          ? 'Stock empty. Activate to recycle the waste.'
          : 'Stock empty.',
    );
  }

  private handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('[data-slot="stock"]')) {
      this.onTap('stock');
      return;
    }
    const cardEl = target.closest<HTMLElement>('.card');
    if (!cardEl) return;
    const t = cardEl.dataset.target;
    if (t === 'stock') this.onTap('stock');
    else if (t === 'waste') this.onTap({ kind: 'waste' });
    else if (t?.startsWith('cell-')) this.onTap({ kind: 'cell', index: Number(t.slice(5)) });
  }

  /** Keyboard activation (Enter/Space on a focused card). */
  bindKeys(): void {
    this.container.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cardEl = (e.target as HTMLElement).closest<HTMLElement>('.card');
      if (!cardEl) return;
      e.preventDefault();
      const t = cardEl.dataset.target;
      if (t === 'waste') this.onTap({ kind: 'waste' });
      else if (t?.startsWith('cell-')) this.onTap({ kind: 'cell', index: Number(t.slice(5)) });
    });
  }

  highlight(targets: Target[] | 'draw' | 'recycle'): void {
    const els: HTMLElement[] = [];
    if (targets === 'draw' || targets === 'recycle') {
      els.push(this.stockSlot);
    } else {
      for (const t of targets) {
        const key = t.kind === 'waste' ? 'waste' : `cell-${t.index}`;
        const el = this.container.querySelector<HTMLElement>(`[data-target="${key}"]`);
        if (el) els.push(el);
      }
    }
    for (const el of els) {
      el.classList.remove('hint');
      void el.offsetWidth;
      el.classList.add('hint');
      window.setTimeout(() => el.classList.remove('hint'), 1600);
    }
  }

  shake(target: Target): void {
    const key = target.kind === 'waste' ? 'waste' : `cell-${target.index}`;
    const el = this.container.querySelector<HTMLElement>(`[data-target="${key}"]`);
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    window.setTimeout(() => el.classList.remove('shake'), 350);
  }

  reset(): void {
    for (const el of this.cardEls.values()) el.remove();
    this.cardEls.clear();
  }
}
