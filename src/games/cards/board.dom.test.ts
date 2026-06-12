// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { deal, applyMove, canDraw } from './klondike';
import { Board, type BoardConfig } from './board';

const KLONDIKE_CONFIG: BoardConfig = {
  tableauCount: 7,
  foundationCount: 4,
  cellCount: 0,
  hasStock: true,
  hasWaste: true,
};

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'board';
  document.body.appendChild(el);
  // happy-dom has no layout engine; stub the measurements the board reads.
  Object.defineProperty(el, 'clientWidth', { value: 700, configurable: true });
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 700, bottom: 900, width: 700, height: 900, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
});

describe('Board (DOM)', () => {
  it('mounts 13 slots and renders 52 card elements', () => {
    const container = makeContainer();
    const board = new Board(container, KLONDIKE_CONFIG);
    const state = deal(42, 1);
    board.setState(state);
    board.render();
    expect(container.querySelectorAll('.slot')).toHaveLength(13);
    expect(container.querySelectorAll('.card')).toHaveLength(52);
    expect(container.querySelectorAll('.card.face-up')).toHaveLength(7);
  });

  it('marks only legal pickups as movable/focusable', () => {
    const container = makeContainer();
    const board = new Board(container, KLONDIKE_CONFIG);
    const state = deal(42, 1);
    board.setState(state);
    board.render();
    const movable = container.querySelectorAll('.card.movable');
    // Exactly the 7 face-up tableau tops are movable on a fresh deal.
    expect(movable).toHaveLength(7);
    for (const el of movable) {
      expect((el as HTMLElement).tabIndex).toBe(0);
      expect(el.getAttribute('role')).toBe('button');
      expect(el.getAttribute('aria-label')).toMatch(/of (spades|hearts|diamonds|clubs)/);
    }
  });

  it('re-renders after a draw without duplicating elements', () => {
    const container = makeContainer();
    const board = new Board(container, KLONDIKE_CONFIG);
    const state = deal(7, 3);
    board.setState(state);
    board.render();
    expect(canDraw(state)).toBe(true);
    applyMove(state, { type: 'draw' });
    board.render();
    expect(container.querySelectorAll('.card')).toHaveLength(52);
    expect(container.querySelectorAll('.card.face-up')).toHaveLength(10);
  });

  it('identifies cards from their elements (refOf round-trip)', () => {
    const container = makeContainer();
    const board = new Board(container, KLONDIKE_CONFIG);
    const state = deal(3, 1);
    board.setState(state);
    board.render();
    const topCard = state.tableau[6]![6]!;
    const el = board.cardElement(topCard.id)!;
    const located = board.refOf(el)!;
    expect(located.ref).toEqual({ kind: 'tableau', index: 6 });
    expect(located.depth).toBe(0);
  });

  it('maps drop coordinates to piles', () => {
    const container = makeContainer();
    const board = new Board(container, KLONDIKE_CONFIG);
    const state = deal(3, 1);
    board.setState(state);
    board.render();
    const m = board.metrics;
    // Center of tableau column 4.
    const t4 = board.dropTargetAt(m.tableau[4]!.x + m.cardW / 2, m.tableauTop + 10);
    expect(t4).toEqual({ kind: 'tableau', index: 4 });
    // Center of foundation 0 (top row, column 3).
    const f0 = board.dropTargetAt(m.foundations[0]!.x + m.cardW / 2, 10);
    expect(f0).toEqual({ kind: 'foundation', index: 0 });
    // Top row above stock/waste accepts nothing.
    expect(board.dropTargetAt(m.stock.x + m.cardW / 2, 10)).toBeNull();
  });

  it('mirrors drop targets in left-hand layout', () => {
    const container = makeContainer();
    const board = new Board(container, KLONDIKE_CONFIG);
    board.setOptions({ leftHand: true });
    board.resize();
    const state = deal(3, 1);
    board.setState(state);
    board.render();
    const m = board.metrics;
    // In left-hand mode foundation 0 sits at mirrored column 3.
    const physicalX = m.boardW - m.cardW - m.foundations[0]!.x;
    const f0 = board.dropTargetAt(physicalX + m.cardW / 2, 10);
    expect(f0).toEqual({ kind: 'foundation', index: 0 });
    // And the tableau column under the same physical x is mirrored too.
    const t = board.dropTargetAt(physicalX + m.cardW / 2, m.tableauTop + 10);
    expect(t).toEqual({ kind: 'tableau', index: 3 });
  });

  it('compresses tall tableau fans to stay inside the board', () => {
    const container = makeContainer();
    const board = new Board(container, KLONDIKE_CONFIG);
    const state = deal(11, 1);
    // Build an artificially tall pile.
    const tall = state.tableau[0]!;
    for (const pile of state.tableau.slice(1)) {
      while (pile.length) {
        const c = pile.pop()!;
        c.faceUp = true;
        tall.push(c);
      }
    }
    board.setState(state);
    board.render();
    const m = board.metrics;
    const last = tall[tall.length - 1]!;
    const pos = board.positionOf(last.id);
    expect(pos.y + m.cardH).toBeLessThanOrEqual(m.boardH + 1);
  });
});
