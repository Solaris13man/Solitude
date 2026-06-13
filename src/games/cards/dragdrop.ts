import type { PileRef } from './types';
import type { Board } from './board';

export interface DragCallbacks {
  /** A quick tap/click on a card (depth = cards above it... 0 = top card). */
  onTap(ref: PileRef, depth: number): void;
  /** Tap on the stock slot (draw or recycle). */
  onStock(): void;
  /** Can the run starting `depth` cards from the top of `ref` be picked up? */
  canPick(ref: PileRef, depth: number): boolean;
  /** Attempt the move on drop; return true if it was applied. */
  onDrop(from: PileRef, count: number, to: PileRef): boolean;
  /** Live drop-target feedback while dragging; target is null between piles. */
  onDragOver(from: PileRef, count: number, target: PileRef | null): void;
  /** Called after a failed drop so the controller can re-render (snap back). */
  onSnapBack(): void;
  /** Elements of the run being dragged. */
  runElements(ref: PileRef, count: number): HTMLElement[];
}

const TAP_DISTANCE = 8;
const TAP_TIME = 400;

/**
 * Unified pointer handling (mouse, touch, pen). A press that moves less than
 * TAP_DISTANCE within TAP_TIME is a tap (auto-move); anything else drags the
 * picked-up run with the pointer and drops it on the pile under the cursor.
 */
export function attachDragDrop(board: Board, callbacks: DragCallbacks): void {
  interface DragSession {
    pointerId: number;
    ref: PileRef;
    depth: number;
    startX: number;
    startY: number;
    startTime: number;
    dragging: boolean;
    els: HTMLElement[];
    origins: { x: number; y: number }[];
    /** Horizontal scroll wrapper, when the board is wider than the screen. */
    scrollEl: HTMLElement | null;
    startScroll: number;
    lastClientX: number;
    lastClientY: number;
    autoScrollRaf: number;
  }
  let session: DragSession | null = null;

  const container = board.container;
  const EDGE = 56; // px from a wrapper edge that triggers auto-scroll
  const MAX_STEP = 18; // px per frame at the very edge

  const scrollWrapper = (): HTMLElement | null =>
    container.closest<HTMLElement>('.board-scroll');

  /** Place the dragged run under the pointer, compensating for any scroll. */
  const positionDrag = (s: DragSession) => {
    const dx = s.lastClientX - s.startX;
    const dy = s.lastClientY - s.startY;
    const sd = s.scrollEl ? s.scrollEl.scrollLeft - s.startScroll : 0;
    for (let i = 0; i < s.els.length; i++) {
      const o = s.origins[i]!;
      s.els[i]!.style.transform = `translate3d(${o.x + dx + sd}px, ${o.y + dy}px, 0)`;
    }
    const lead = s.els[0]!;
    const rect = lead.getBoundingClientRect();
    const p = board.toBoardCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
    callbacks.onDragOver(s.ref, s.depth + 1, board.dropTargetAt(p.x, p.y));
  };

  /** Scroll the wrapper one step if the pointer is hugging an edge. */
  const autoScrollStep = (s: DragSession): boolean => {
    const el = s.scrollEl;
    if (!el) return false;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return false;
    const rect = el.getBoundingClientRect();
    let step = 0;
    if (s.lastClientX < rect.left + EDGE) {
      step = -MAX_STEP * Math.min(1, (rect.left + EDGE - s.lastClientX) / EDGE);
    } else if (s.lastClientX > rect.right - EDGE) {
      step = MAX_STEP * Math.min(1, (s.lastClientX - (rect.right - EDGE)) / EDGE);
    }
    if (step === 0) return false;
    const next = Math.max(0, Math.min(maxScroll, el.scrollLeft + step));
    if (next === el.scrollLeft) return false;
    el.scrollLeft = next;
    return true;
  };

  const runAutoScroll = () => {
    if (!session || !session.dragging) return;
    if (autoScrollStep(session)) positionDrag(session);
    session.autoScrollRaf = requestAnimationFrame(runAutoScroll);
  };

  const stopAutoScroll = (s: DragSession) => {
    if (s.autoScrollRaf) cancelAnimationFrame(s.autoScrollRaf);
    s.autoScrollRaf = 0;
  };

  container.addEventListener('pointerdown', (e) => {
    if (session || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const slot = target.closest<HTMLElement>('.slot-stock');
    if (slot) return; // handled on click/keydown for taps
    const cardEl = target.closest<HTMLElement>('.card');
    if (!cardEl) return;
    const located = board.refOf(cardEl);
    if (!located) return;
    // Stock cards aren't pickable, but a tap on them still draws (handled in
    // onTap by the controller), so the session proceeds with an empty run.
    e.preventDefault();
    const count = located.depth + 1;
    const pickable = callbacks.canPick(located.ref, located.depth);
    const els = pickable ? callbacks.runElements(located.ref, count) : [];
    const scrollEl = scrollWrapper();
    session = {
      pointerId: e.pointerId,
      ref: located.ref,
      depth: located.depth,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      dragging: false,
      els,
      origins: els.map((el) => {
        const id = el.dataset.id!;
        return board.positionOf(id);
      }),
      scrollEl,
      startScroll: scrollEl ? scrollEl.scrollLeft : 0,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      autoScrollRaf: 0,
    };
    container.setPointerCapture(e.pointerId);
  });

  container.addEventListener('pointermove', (e) => {
    if (!session || e.pointerId !== session.pointerId) return;
    session.lastClientX = e.clientX;
    session.lastClientY = e.clientY;
    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    if (!session.dragging) {
      if (Math.hypot(dx, dy) < TAP_DISTANCE) return;
      if (session.els.length === 0) return; // not pickable: can still be a tap, never a drag
      session.dragging = true;
      for (const el of session.els) el.classList.add('dragging');
      // Begin the edge-scroll watcher now that a real drag is underway.
      session.autoScrollRaf = requestAnimationFrame(runAutoScroll);
    }
    positionDrag(session);
  });

  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (!session || e.pointerId !== session.pointerId) return;
    const s = session;
    session = null;
    stopAutoScroll(s);
    try {
      container.releasePointerCapture(e.pointerId);
    } catch {
      // capture may already be released
    }
    if (!s.dragging) {
      const quick =
        performance.now() - s.startTime < TAP_TIME &&
        Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < TAP_DISTANCE;
      if (!cancelled && quick) callbacks.onTap(s.ref, s.depth);
      return;
    }
    for (const el of s.els) {
      el.classList.remove('dragging');
      // Springier easing while the released run settles into place.
      el.classList.add('settling');
      window.setTimeout(() => el.classList.remove('settling'), 450);
    }
    if (!cancelled) {
      // Drop point: the center of the lead (first) dragged card.
      const lead = s.els[0]!;
      const rect = lead.getBoundingClientRect();
      const p = board.toBoardCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const target = board.dropTargetAt(p.x, p.y);
      if (target && callbacks.onDrop(s.ref, s.depth + 1, target)) return;
    }
    callbacks.onSnapBack();
  };

  container.addEventListener('pointerup', (e) => finish(e, false));
  container.addEventListener('pointercancel', (e) => finish(e, true));

  // Stock slot: tap or keyboard activation draws/recycles.
  const stockSlot = board.slotElement('stock');
  if (stockSlot) {
    stockSlot.addEventListener('click', () => callbacks.onStock());
    stockSlot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        callbacks.onStock();
      }
    });
  }

  // Keyboard activation of a focused card = same as a tap.
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cardEl = (e.target as HTMLElement).closest<HTMLElement>('.card');
    if (!cardEl) return;
    const located = board.refOf(cardEl);
    if (!located || located.ref.kind === 'stock') return;
    e.preventDefault();
    callbacks.onTap(located.ref, located.depth);
  });
}
