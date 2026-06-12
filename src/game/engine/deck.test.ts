import { describe, expect, it } from 'vitest';
import { createDeck, shuffledDeck } from './deck';
import { mulberry32 } from './rng';

describe('deck', () => {
  it('has 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });

  it('shuffles deterministically: same seed, same order', () => {
    const a = shuffledDeck(12345);
    const b = shuffledDeck(12345);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it('different seeds give different orders', () => {
    const a = shuffledDeck(1);
    const b = shuffledDeck(2);
    expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
  });

  it('shuffle preserves all 52 cards', () => {
    const deck = shuffledDeck(999);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });
});

describe('mulberry32', () => {
  it('produces values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is reproducible', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
