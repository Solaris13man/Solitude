import { describe, expect, it } from 'vitest';
import * as pyramid from './pyramid';
import * as tripeaks from './tripeaks';
import { cloneState, deserialize, serialize, type PeaksState, type Target } from './types';

describe('pyramid', () => {
  it('deals 28 face-up cells and a 24-card stock, deterministically', () => {
    const s = pyramid.deal(42);
    expect(s.cells).toHaveLength(28);
    expect(s.cells.every((c) => c.card.faceUp && !c.removed)).toBe(true);
    expect(s.stock).toHaveLength(24);
    expect(JSON.stringify(pyramid.deal(7))).toBe(JSON.stringify(pyramid.deal(7)));
  });

  it('only uncovered cells are exposed', () => {
    const s = pyramid.deal(42);
    // bottom row indexes 21..27 are exposed; apex 0 is not
    for (let i = 21; i < 28; i++) expect(pyramid.isExposed(s, i)).toBe(true);
    expect(pyramid.isExposed(s, 0)).toBe(false);
    // removing a bottom-row pair exposes nothing above until both parents clear
    s.cells[21]!.removed = true;
    expect(pyramid.isExposed(s, 15)).toBe(false);
    s.cells[22]!.removed = true;
    expect(pyramid.isExposed(s, 15)).toBe(true);
  });

  it('removes kings alone and pairs summing to 13', () => {
    const s = pyramid.deal(1);
    // construct: make two exposed bottom cells a known pair
    s.cells[21]!.card.rank = 6;
    s.cells[22]!.card.rank = 7;
    s.cells[23]!.card.rank = 13;
    const a: Target = { kind: 'cell', index: 21 };
    const b: Target = { kind: 'cell', index: 22 };
    expect(pyramid.tap(s, { kind: 'cell', index: 23 }, null)).toBe('applied');
    expect(s.cells[23]!.removed).toBe(true);
    expect(pyramid.tap(s, a, null)).toBe('select');
    expect(pyramid.tap(s, b, a)).toBe('applied');
    expect(s.cells[21]!.removed).toBe(true);
    expect(s.cells[22]!.removed).toBe(true);
  });

  it('pairs with the waste top and limits recycles to two', () => {
    const s = pyramid.deal(1);
    pyramid.draw(s);
    s.waste[0]!.rank = 4;
    s.cells[24]!.card.rank = 9;
    expect(pyramid.tap(s, { kind: 'waste' }, null)).toBe('select');
    expect(pyramid.tap(s, { kind: 'cell', index: 24 }, { kind: 'waste' })).toBe('applied');
    expect(s.waste).toHaveLength(0);
    expect(s.cells[24]!.removed).toBe(true);
    while (pyramid.canDraw(s)) pyramid.draw(s);
    expect(pyramid.canRecycle(s)).toBe(true);
    pyramid.recycle(s);
    while (pyramid.canDraw(s)) pyramid.draw(s);
    pyramid.recycle(s);
    while (pyramid.canDraw(s)) pyramid.draw(s);
    expect(pyramid.canRecycle(s)).toBe(false); // third recycle refused
  });

  it('hint finds kings, pairs, then stock; wins when all cells clear', () => {
    const s = pyramid.deal(1);
    s.cells.forEach((c) => (c.removed = true));
    expect(pyramid.isWon(s)).toBe(true);
    const fresh = pyramid.deal(1);
    const h = fresh.stock.length > 0 ? pyramid.hint(fresh) : null;
    expect(h === 'draw' || Array.isArray(h)).toBe(true);
  });
});

describe('tripeaks', () => {
  it('deals 28 cells (bottom row face up), 23 stock, 1 waste', () => {
    const s = tripeaks.deal(42);
    expect(s.cells).toHaveLength(28);
    expect(s.stock).toHaveLength(23);
    expect(s.waste).toHaveLength(1);
    const faceUp = s.cells.filter((c) => c.card.faceUp);
    expect(faceUp).toHaveLength(10);
  });

  it('plays wrap-adjacent cards and builds the streak score', () => {
    const s = tripeaks.deal(1);
    s.waste[0]!.rank = 13;
    // bottom row starts at index 18
    s.cells[18]!.card.rank = 1; // wraps K→A
    s.cells[19]!.card.rank = 2;
    expect(tripeaks.tap(s, { kind: 'cell', index: 18 }, null)).toBe('applied');
    expect(s.score).toBe(10);
    expect(tripeaks.tap(s, { kind: 'cell', index: 19 }, null)).toBe('applied');
    expect(s.score).toBe(30); // 10 + 20 streak scoring
    tripeaks.draw(s);
    expect(s.streak).toBe(0);
  });

  it('rejects non-adjacent and blocked cards', () => {
    const s = tripeaks.deal(1);
    s.waste[0]!.rank = 5;
    s.cells[18]!.card.rank = 9;
    expect(tripeaks.tap(s, { kind: 'cell', index: 18 }, null)).toBe('invalid');
    expect(tripeaks.tap(s, { kind: 'cell', index: 0 }, null)).toBe('invalid'); // covered peak
  });

  it('uncovering flips cards face up', () => {
    const s = tripeaks.deal(1);
    // clear the two bottom-row cards covering the leftmost row-2 cell (index 9)
    const covering = [18, 19];
    s.waste[0]!.rank = s.cells[18]!.card.rank + 1 <= 13 ? ((s.cells[18]!.card.rank + 1) as 1) : 1;
    for (const i of covering) {
      s.cells[i]!.removed = true;
    }
    // trigger the face refresh via a legal play elsewhere
    s.waste[s.waste.length - 1]!.rank = s.cells[20]!.card.rank === 13 ? 1 : ((s.cells[20]!.card.rank + 1) as 1);
    tripeaks.tap(s, { kind: 'cell', index: 20 }, null);
    expect(s.cells[9]!.card.faceUp).toBe(true);
  });

  it('hint suggests a playable card, else drawing', () => {
    const s = tripeaks.deal(1);
    s.waste[0]!.rank = s.cells[18]!.card.rank === 13 ? 12 : ((s.cells[18]!.card.rank + 1) as 1);
    const h = tripeaks.hint(s);
    expect(Array.isArray(h)).toBe(true);
    s.cells.forEach((c, i) => {
      if (SBOTTOM(i)) c.card.rank = 5 as 5;
    });
    s.waste[s.waste.length - 1]!.rank = 9;
    expect(tripeaks.hint(s)).toBe('draw');

    function SBOTTOM(i: number): boolean {
      return i >= 9; // rows 2 and 3 cover all exposed cards on a fresh deal
    }
  });
});

describe('peaks serialization', () => {
  it('round-trips and enforces the game id', () => {
    const s: PeaksState = pyramid.deal(3);
    const json = serialize(s, 5000);
    expect(deserialize(json, 'pyramid')!.elapsedMs).toBe(5000);
    expect(deserialize(json, 'tripeaks')).toBeNull();
    const c = cloneState(s);
    s.cells[27]!.removed = true;
    expect(c.cells[27]!.removed).toBe(false);
  });
});
