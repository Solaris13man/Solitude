import { mulberry32, type Rng } from '../cards/rng';

/**
 * Mahjong Solitaire: 144 tiles in the classic Turtle formation. Match pairs
 * of free tiles (nothing on top, at least one long side open). Deals are
 * built by reverse construction, so every deal is guaranteed winnable.
 */

/** Position in half-tile units; a tile occupies 2×2 half-units on layer z. */
export interface TileSlot {
  x: number;
  y: number;
  z: number;
}

export interface MahjongTile {
  kind: string;
  removed: boolean;
}

export interface MahjongState {
  game: 'mahjong';
  seed: number;
  variant: number;
  tiles: MahjongTile[];
  moves: number;
  score: number;
}

/** The classic Turtle: 144 slots across five layers. */
export const TURTLE: TileSlot[] = (() => {
  const slots: TileSlot[] = [];
  const row = (y: number, xs: number[], z = 0) => {
    for (const x of xs) slots.push({ x, y, z });
  };
  const range = (from: number, to: number) => {
    const out: number[] = [];
    for (let x = from; x <= to; x += 2) out.push(x);
    return out;
  };
  // layer 0
  row(0, range(2, 24));
  row(2, range(6, 20));
  row(4, range(4, 22));
  row(6, range(2, 24));
  row(8, range(2, 24));
  row(10, range(4, 22));
  row(12, range(6, 20));
  row(14, range(2, 24));
  // endcaps straddling the middle rows
  row(7, [0]);
  row(7, [26]);
  row(7, [28]);
  // layer 1: 6×6
  for (let y = 2; y <= 12; y += 2) row(y, range(8, 18), 1);
  // layer 2: 4×4
  for (let y = 4; y <= 10; y += 2) row(y, range(10, 16), 2);
  // layer 3: 2×2
  for (let y = 6; y <= 8; y += 2) row(y, [12, 14], 3);
  // layer 4: apex
  slots.push({ x: 13, y: 7, z: 4 });
  return slots;
})();

/** 4 copies of 34 matchable kinds + 4 unique flowers + 4 unique seasons. */
export function tileKinds(): string[] {
  const kinds: string[] = [];
  for (const suit of ['d', 'b', 'c']) {
    for (let n = 1; n <= 9; n++) {
      for (let copy = 0; copy < 4; copy++) kinds.push(`${suit}${n}`);
    }
  }
  for (const wind of ['wE', 'wS', 'wW', 'wN']) {
    for (let copy = 0; copy < 4; copy++) kinds.push(wind);
  }
  for (const dragon of ['gR', 'gG', 'gW']) {
    for (let copy = 0; copy < 4; copy++) kinds.push(dragon);
  }
  for (let n = 1; n <= 4; n++) kinds.push(`f${n}`);
  for (let n = 1; n <= 4; n++) kinds.push(`s${n}`);
  return kinds;
}

/** Flowers match flowers, seasons match seasons, everything else exactly. */
export function matches(a: string, b: string): boolean {
  if (a.startsWith('f') && b.startsWith('f')) return true;
  if (a.startsWith('s') && b.startsWith('s')) return true;
  return a === b;
}

function overlaps(a: TileSlot, b: TileSlot): boolean {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}

/** Free given a set of occupied slot indexes. */
function freeIn(occupied: boolean[], index: number): boolean {
  const slot = TURTLE[index]!;
  let leftBlocked = false;
  let rightBlocked = false;
  for (let i = 0; i < TURTLE.length; i++) {
    if (!occupied[i] || i === index) continue;
    const other = TURTLE[i]!;
    if (other.z === slot.z + 1 && overlaps(other, slot)) return false;
    if (other.z === slot.z && Math.abs(other.y - slot.y) < 2) {
      if (other.x === slot.x - 2) leftBlocked = true;
      if (other.x === slot.x + 2) rightBlocked = true;
    }
  }
  return !leftBlocked || !rightBlocked;
}

export function isFree(state: MahjongState, index: number): boolean {
  if (state.tiles[index]!.removed) return false;
  return freeIn(state.tiles.map((t) => !t.removed), index);
}

/**
 * Reverse construction: starting from the full formation, repeatedly remove
 * a random pair of currently free slots, assigning each removal a matching
 * tile pair. Replaying the removals in order solves the deal, so the deal
 * is winnable by construction.
 */
export function generateDeal(seed: number): { kinds: string[]; solution: [number, number][] } {
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = mulberry32((seed + attempt * 0x9e3779b9) >>> 0);
    const result = tryGenerate(rng);
    if (result) return result;
  }
  throw new Error('mahjong deal generation failed');
}

function tryGenerate(rng: Rng): { kinds: string[]; solution: [number, number][] } | null {
  // Shuffle matchable pairs of kinds.
  const kindList = tileKinds();
  const pairs: [string, string][] = [];
  const pool = new Map<string, number>();
  for (const k of kindList) pool.set(k, (pool.get(k) ?? 0) + 1);
  // Build 72 pairs: identical kinds pair up; flowers together, seasons together.
  for (const [kind, count] of pool) {
    if (kind.startsWith('f') || kind.startsWith('s')) continue;
    for (let i = 0; i < count / 2; i++) pairs.push([kind, kind]);
  }
  pairs.push(['f1', 'f2'], ['f3', 'f4'], ['s1', 's2'], ['s3', 's4']);
  // shuffle pair order
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
  }

  const occupied = TURTLE.map(() => true);
  const kinds = new Array<string>(TURTLE.length).fill('');
  const solution: [number, number][] = [];
  for (const [ka, kb] of pairs) {
    const free: number[] = [];
    for (let i = 0; i < TURTLE.length; i++) {
      if (occupied[i] && freeIn(occupied, i)) free.push(i);
    }
    if (free.length < 2) return null;
    const ai = Math.floor(rng() * free.length);
    const a = free[ai]!;
    free.splice(ai, 1);
    const b = free[Math.floor(rng() * free.length)]!;
    kinds[a] = ka;
    kinds[b] = kb;
    occupied[a] = false;
    occupied[b] = false;
    solution.push([a, b]);
  }
  return { kinds, solution };
}

export function deal(seed: number): MahjongState {
  const { kinds } = generateDeal(seed);
  return {
    game: 'mahjong',
    seed,
    variant: 0,
    tiles: kinds.map((kind) => ({ kind, removed: false })),
    moves: 0,
    score: 0,
  };
}

export function cloneState(state: MahjongState): MahjongState {
  return { ...state, tiles: state.tiles.map((t) => ({ ...t })) };
}

export type TapResult = 'applied' | 'select' | 'deselect' | 'invalid';

export function tap(state: MahjongState, index: number, selected: number | null): TapResult {
  if (!isFree(state, index)) return 'invalid';
  if (selected === null) return 'select';
  if (selected === index) return 'deselect';
  if (
    !state.tiles[selected]!.removed &&
    matches(state.tiles[selected]!.kind, state.tiles[index]!.kind)
  ) {
    state.tiles[selected]!.removed = true;
    state.tiles[index]!.removed = true;
    state.moves++;
    state.score += 10;
    return 'applied';
  }
  return 'select';
}

export function isWon(state: MahjongState): boolean {
  return state.tiles.every((t) => t.removed);
}

export function tilesLeft(state: MahjongState): number {
  return state.tiles.filter((t) => !t.removed).length;
}

/** A matching free pair, or null when the position is dead. */
export function hint(state: MahjongState): [number, number] | null {
  const free: number[] = [];
  const occupied = state.tiles.map((t) => !t.removed);
  for (let i = 0; i < TURTLE.length; i++) {
    if (occupied[i] && freeIn(occupied, i)) free.push(i);
  }
  for (let a = 0; a < free.length; a++) {
    for (let b = a + 1; b < free.length; b++) {
      if (matches(state.tiles[free[a]!]!.kind, state.tiles[free[b]!]!.kind)) {
        return [free[a]!, free[b]!];
      }
    }
  }
  return null;
}

export interface SerializedMahjong {
  v: 1;
  state: MahjongState;
  elapsedMs: number;
}

export function serialize(state: MahjongState, elapsedMs: number): string {
  return JSON.stringify({ v: 1, state, elapsedMs } satisfies SerializedMahjong);
}

export function deserialize(json: string): SerializedMahjong | null {
  try {
    const data = JSON.parse(json) as SerializedMahjong;
    if (data.v !== 1 || data.state?.game !== 'mahjong') return null;
    if (!Array.isArray(data.state.tiles) || data.state.tiles.length !== TURTLE.length) return null;
    return data;
  } catch {
    return null;
  }
}
