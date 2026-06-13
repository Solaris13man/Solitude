import { describe, expect, it } from 'vitest';
import {
  type G2048State,
  type Tile,
  bestTile,
  canMove,
  cloneState,
  deal,
  deserialize,
  isOver,
  move,
  serialize,
} from './engine';

function stateWith(tiles: [number, number, number][]): G2048State {
  // tiles: [r, c, value]
  return {
    game: '2048',
    seed: 1,
    variant: 0,
    tiles: tiles.map(([r, c, value], i) => ({ id: i + 1, value, r, c })),
    nextId: 100,
    spawns: 99, // far from the dealt sequence
    score: 0,
    moves: 0,
    reached2048: false,
  };
}

function grid(state: G2048State): number[][] {
  const g = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (const t of state.tiles) g[t.r]![t.c] = t.value;
  return g;
}

describe('2048 deal', () => {
  it('starts with two tiles, deterministically per seed', () => {
    const a = deal(42);
    expect(a.tiles).toHaveLength(2);
    expect(JSON.stringify(deal(42))).toBe(JSON.stringify(deal(42)));
    expect(JSON.stringify(deal(43))).not.toBe(JSON.stringify(deal(42)));
    for (const t of a.tiles) expect([2, 4]).toContain(t.value);
  });
});

describe('2048 movement and merging', () => {
  it('slides tiles to the wall', () => {
    const s = stateWith([[0, 1, 2], [0, 3, 4]]);
    const events = move(s, 'left');
    expect(events.moved).toBe(true);
    const row = grid(s)[0]!;
    expect(row[0]).toBe(2);
    expect(row[1]).toBe(4);
  });

  it('merges equal tiles once and scores the merge', () => {
    const s = stateWith([[0, 0, 2], [0, 1, 2], [0, 2, 4]]);
    const events = move(s, 'left');
    expect(events.merges).toHaveLength(1);
    expect(events.removedTiles).toHaveLength(1);
    expect(s.score).toBe(4);
    const row = grid(s)[0]!;
    expect(row[0]).toBe(4);
    expect(row[1]).toBe(4);
  });

  it('does not chain-merge in one move: 2,2,2,2 → 4,4', () => {
    const s = stateWith([[0, 0, 2], [0, 1, 2], [0, 2, 2], [0, 3, 2]]);
    move(s, 'left');
    const row = grid(s)[0]!;
    expect(row[0]).toBe(4);
    expect(row[1]).toBe(4);
    expect(s.score).toBe(8);
  });

  it('merges toward the move direction: 2,2,2 left keeps the pair at the wall', () => {
    const s = stateWith([[0, 0, 2], [0, 1, 2], [0, 2, 2]]);
    move(s, 'left');
    const row = grid(s)[0]!;
    expect(row[0]).toBe(4);
    expect(row[1]).toBe(2);
  });

  it('a move that changes nothing reports moved=false and spawns nothing', () => {
    const s = stateWith([[0, 0, 2], [1, 0, 4]]);
    const before = s.tiles.length;
    const events = move(s, 'left');
    expect(events.moved).toBe(false);
    expect(s.tiles).toHaveLength(before);
    expect(s.moves).toBe(0);
  });

  it('a successful move spawns exactly one tile', () => {
    const s = stateWith([[0, 1, 2]]);
    const events = move(s, 'left');
    expect(events.spawned).not.toBeNull();
    expect(s.tiles).toHaveLength(2);
  });

  it('non-merged tiles keep their ids across slides', () => {
    const s = stateWith([[0, 3, 8]]);
    const id = s.tiles[0]!.id;
    move(s, 'left');
    const slid = s.tiles.find((t: Tile) => t.id === id)!;
    expect(slid.c).toBe(0);
    expect(slid.value).toBe(8);
  });

  it('vertical moves work', () => {
    const s = stateWith([[0, 0, 2], [3, 0, 2]]);
    move(s, 'down');
    expect(grid(s)[3]![0]).toBe(4);
  });
});

describe('2048 game over and win', () => {
  it('detects a dead full board and a mergeable full board', () => {
    const dead: [number, number, number][] = [];
    // checkerboard of 2s and 4s — full, no merges
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) dead.push([r, c, (r + c) % 2 === 0 ? 2 : 4]);
    }
    expect(isOver(stateWith(dead))).toBe(true);
    const mergeable = dead.slice();
    mergeable[1] = [0, 1, 2]; // two 2s now adjacent
    expect(canMove(stateWith(mergeable))).toBe(true);
  });

  it('flags reaching 2048', () => {
    const s = stateWith([[0, 0, 1024], [0, 1, 1024]]);
    move(s, 'left');
    expect(s.reached2048).toBe(true);
    expect(bestTile(s)).toBe(2048);
  });
});

describe('2048 serialization', () => {
  it('round-trips and clone is deep', () => {
    const s = deal(9);
    move(s, 'left');
    const restored = deserialize(serialize(s, 777));
    expect(restored!.elapsedMs).toBe(777);
    expect(JSON.stringify(restored!.state)).toBe(JSON.stringify(s));
    const c = cloneState(s);
    s.tiles[0]!.value = 999;
    expect(c.tiles[0]!.value).not.toBe(999);
  });
});
