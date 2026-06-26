/**
 * Deterministic PRNG (mulberry32). The same seed always produces the same
 * sequence, which makes deals reproducible and shareable.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random 32-bit seed for casual "new game" deals. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * A friendly, shareable deal number (1–1,000,000) for games that surface their
 * deal number to players. Small enough to type or read aloud, with a million
 * distinct deals per game — plenty for replay/share.
 */
export function friendlyDealSeed(): number {
  return 1 + Math.floor(Math.random() * 1_000_000);
}
