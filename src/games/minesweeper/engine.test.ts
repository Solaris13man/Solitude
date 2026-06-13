import { describe, expect, it } from 'vitest';
import {
  chord,
  cloneState,
  deal,
  deserialize,
  flagsRemaining,
  neighbors,
  placeMines,
  reveal,
  serialize,
  toggleFlag,
} from './engine';

describe('minesweeper deal and placement', () => {
  it('builds boards per difficulty', () => {
    const easy = deal(1, 1);
    expect(easy.width * easy.height).toBe(81);
    expect(easy.mineCount).toBe(10);
    const expert = deal(1, 3);
    expect(expert.width).toBe(30);
    expect(expert.mineCount).toBe(99);
  });

  it('places the right number of mines, never on or next to the first click', () => {
    const s = deal(42, 2);
    const first = 5 * s.width + 5;
    placeMines(s, first);
    expect(s.mine.filter(Boolean)).toHaveLength(40);
    expect(s.mine[first]).toBe(false);
    for (const n of neighbors(s, first)) expect(s.mine[n]).toBe(false);
  });

  it('is deterministic: same seed and first click, same board', () => {
    const a = deal(7, 1);
    const b = deal(7, 1);
    placeMines(a, 40);
    placeMines(b, 40);
    expect(a.mine).toEqual(b.mine);
    const c = deal(8, 1);
    placeMines(c, 40);
    expect(c.mine).not.toEqual(a.mine);
  });

  it('adjacent counts are consistent with mines', () => {
    const s = deal(3, 1);
    placeMines(s, 0);
    for (let i = 0; i < s.mine.length; i++) {
      expect(s.adjacent[i]).toBe(neighbors(s, i).filter((n) => s.mine[n]).length);
    }
  });
});

describe('minesweeper play', () => {
  it('first reveal opens safely and flood-fills zeros', () => {
    const s = deal(11, 1);
    reveal(s, 40);
    expect(s.status).toBe('playing');
    expect(s.revealed[40]).toBe(true);
    // the safe zone guarantees a zero opening, so neighbors opened too
    for (const n of neighbors(s, 40)) expect(s.revealed[n]).toBe(true);
  });

  it('revealing a mine loses and exposes all mines', () => {
    const s = deal(11, 1);
    reveal(s, 40);
    const mineIdx = s.mine.findIndex(Boolean);
    reveal(s, mineIdx);
    expect(s.status).toBe('lost');
    s.mine.forEach((m, i) => {
      if (m) expect(s.revealed[i]).toBe(true);
    });
  });

  it('flags block reveals and count down the mine counter', () => {
    const s = deal(11, 1);
    reveal(s, 40);
    const closed = s.revealed.findIndex((r) => !r);
    toggleFlag(s, closed);
    expect(flagsRemaining(s)).toBe(9);
    reveal(s, closed);
    expect(s.revealed[closed]).toBe(false);
    toggleFlag(s, closed);
    expect(flagsRemaining(s)).toBe(10);
  });

  it('revealing every safe cell wins', () => {
    const s = deal(11, 1);
    reveal(s, 40);
    for (let i = 0; i < s.mine.length; i++) {
      if (!s.mine[i]) reveal(s, i);
    }
    expect(s.status).toBe('won');
  });

  it('chord reveals neighbors when flags match the number', () => {
    const s = deal(13, 1);
    reveal(s, 40);
    // find a revealed number with at least one closed neighbor
    const i = s.revealed.findIndex(
      (r, idx) =>
        r && s.adjacent[idx]! > 0 && neighbors(s, idx).some((n) => !s.revealed[n]),
    );
    expect(i).toBeGreaterThanOrEqual(0);
    // flag exactly the mined neighbors (cheating with engine knowledge)
    for (const n of neighbors(s, i)) {
      if (s.mine[n] && !s.flagged[n]) toggleFlag(s, n);
    }
    chord(s, i);
    expect(s.status).not.toBe('lost');
    for (const n of neighbors(s, i)) {
      if (!s.mine[n]) expect(s.revealed[n]).toBe(true);
    }
  });
});

describe('minesweeper serialization', () => {
  it('round-trips and clone is deep', () => {
    const s = deal(5, 2);
    reveal(s, 0);
    const restored = deserialize(serialize(s, 1234));
    expect(restored!.elapsedMs).toBe(1234);
    expect(JSON.stringify(restored!.state)).toBe(JSON.stringify(s));
    const c = cloneState(s);
    s.flagged[3] = !s.flagged[3];
    expect(c.flagged[3]).not.toBe(s.flagged[3]);
  });
});
