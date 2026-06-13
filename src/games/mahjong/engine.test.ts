import { describe, expect, it } from 'vitest';
import {
  TURTLE,
  cloneState,
  deal,
  deserialize,
  generateDeal,
  hint,
  isFree,
  isWon,
  matches,
  serialize,
  tap,
  tileKinds,
  tilesLeft,
} from './engine';

describe('mahjong layout and tile set', () => {
  it('the turtle has 144 slots in five layers', () => {
    expect(TURTLE).toHaveLength(144);
    expect(new Set(TURTLE.map((s) => s.z))).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('the tile set has 144 tiles with the right multiplicities', () => {
    const kinds = tileKinds();
    expect(kinds).toHaveLength(144);
    const counts = new Map<string, number>();
    for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
    expect(counts.get('d5')).toBe(4);
    expect(counts.get('wN')).toBe(4);
    expect(counts.get('gR')).toBe(4);
    expect(counts.get('f1')).toBe(1);
    expect(counts.get('s4')).toBe(1);
  });

  it('flowers match flowers and seasons match seasons', () => {
    expect(matches('f1', 'f3')).toBe(true);
    expect(matches('s2', 's4')).toBe(true);
    expect(matches('f1', 's1')).toBe(false);
    expect(matches('d3', 'd3')).toBe(true);
    expect(matches('d3', 'b3')).toBe(false);
  });
});

describe('mahjong deals', () => {
  it('is deterministic per seed', () => {
    expect(JSON.stringify(deal(42))).toBe(JSON.stringify(deal(42)));
    expect(JSON.stringify(deal(42))).not.toBe(JSON.stringify(deal(43)));
  });

  it('every deal is winnable by construction', () => {
    for (const seed of [1, 777, 20260613]) {
      const { kinds, solution } = generateDeal(seed);
      expect(solution).toHaveLength(72);
      // Replay the construction order against the real rules: every pair
      // must be free and matching at its turn.
      const state = {
        game: 'mahjong' as const,
        seed,
        variant: 0,
        tiles: kinds.map((kind) => ({ kind, removed: false })),
        moves: 0,
        score: 0,
      };
      for (const [a, b] of solution) {
        expect(isFree(state, a)).toBe(true);
        expect(isFree(state, b)).toBe(true);
        expect(matches(state.tiles[a]!.kind, state.tiles[b]!.kind)).toBe(true);
        state.tiles[a]!.removed = true;
        state.tiles[b]!.removed = true;
      }
      expect(isWon(state)).toBe(true);
    }
  });
});

describe('mahjong free rules', () => {
  it('covered and double-side-blocked tiles are not free', () => {
    const s = deal(1);
    // the apex is free; a layer-3 tile under it is covered
    const apex = TURTLE.findIndex((t) => t.z === 4);
    const under = TURTLE.findIndex((t) => t.z === 3);
    expect(isFree(s, apex)).toBe(true);
    expect(isFree(s, under)).toBe(false);
    // a middle tile of the long top row is side-blocked both ways
    const midTop = TURTLE.findIndex((t) => t.z === 0 && t.y === 0 && t.x === 12);
    expect(isFree(s, midTop)).toBe(false);
    // the row ends are free
    const rowEnd = TURTLE.findIndex((t) => t.z === 0 && t.y === 0 && t.x === 2);
    expect(isFree(s, rowEnd)).toBe(true);
  });
});

describe('mahjong play', () => {
  it('select/deselect/match flow removes pairs', () => {
    const s = deal(5);
    const pair = hint(s)!;
    expect(pair).not.toBeNull();
    expect(tap(s, pair[0], null)).toBe('select');
    expect(tap(s, pair[0], pair[0])).toBe('deselect');
    expect(tap(s, pair[0], null)).toBe('select');
    expect(tap(s, pair[1], pair[0])).toBe('applied');
    expect(tilesLeft(s)).toBe(142);
    expect(s.moves).toBe(1);
  });

  it('non-matching free tiles switch the selection', () => {
    const s = deal(5);
    const free: number[] = [];
    for (let i = 0; i < TURTLE.length && free.length < 6; i++) {
      if (isFree(s, i)) free.push(i);
    }
    const a = free.find((i) => !s.tiles[i]!.kind.startsWith('f'))!;
    const b = free.find((i) => i !== a && !matches(s.tiles[a]!.kind, s.tiles[i]!.kind))!;
    expect(tap(s, b, a)).toBe('select');
  });

  it('hint finds a pair on a fresh winnable deal', () => {
    expect(hint(deal(9))).not.toBeNull();
  });

  it('serialization round-trips and clone is deep', () => {
    const s = deal(7);
    const pair = hint(s)!;
    tap(s, pair[0], null);
    tap(s, pair[1], pair[0]);
    const restored = deserialize(serialize(s, 4000));
    expect(restored!.elapsedMs).toBe(4000);
    expect(JSON.stringify(restored!.state)).toBe(JSON.stringify(s));
    const c = cloneState(s);
    s.tiles[0]!.removed = !s.tiles[0]!.removed;
    expect(c.tiles[0]!.removed).not.toBe(s.tiles[0]!.removed);
    expect(deserialize('{"v":1,"state":{"game":"sudoku"}}')).toBeNull();
  });
});
