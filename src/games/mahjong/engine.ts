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

const range = (from: number, to: number) => {
  const out: number[] = [];
  for (let x = from; x <= to; x += 2) out.push(x);
  return out;
};

/** Filled rectangle of slots on one layer. */
function block(x0: number, x1: number, y0: number, y1: number, z: number): TileSlot[] {
  const out: TileSlot[] = [];
  for (const y of range(y0, y1)) for (const x of range(x0, x1)) out.push({ x, y, z });
  return out;
}

/** Hollow rectangle (perimeter only) on one layer. */
function ring(x0: number, x1: number, y0: number, y1: number, z: number): TileSlot[] {
  const out: TileSlot[] = [];
  for (const y of range(y0, y1)) {
    for (const x of range(x0, x1)) {
      if (y === y0 || y === y1 || x === x0 || x === x1) out.push({ x, y, z });
    }
  }
  return out;
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

/** Cross: two crossing bars, stepped layers. 74 tiles. */
export const CROSS: TileSlot[] = (() => {
  const slots: TileSlot[] = [];
  slots.push(...block(0, 26, 6, 8, 0));
  for (const y of [0, 2, 4, 10, 12, 14]) for (const x of [12, 14]) slots.push({ x, y, z: 0 });
  slots.push(...block(6, 20, 6, 8, 1));
  for (const y of [2, 4, 10, 12]) for (const x of [12, 14]) slots.push({ x, y, z: 1 });
  slots.push(...block(10, 16, 6, 8, 2));
  slots.push({ x: 12, y: 7, z: 3 }, { x: 14, y: 7, z: 3 });
  return slots;
})();

/** Ziggurat: a stepped square pyramid. 132 tiles. */
export const ZIGGURAT: TileSlot[] = (() => {
  const slots: TileSlot[] = [];
  slots.push(...block(0, 22, 0, 10, 0));
  slots.push(...block(2, 20, 2, 8, 1));
  slots.push(...block(4, 18, 4, 6, 2));
  for (const x of [8, 10, 12, 14]) slots.push({ x, y: 5, z: 3 });
  return slots;
})();

/** Fortress: a filled courtyard with rising walls. 128 tiles. */
export const FORTRESS: TileSlot[] = (() => {
  const slots: TileSlot[] = [];
  slots.push(...block(0, 22, 0, 12, 0));
  slots.push(...ring(2, 20, 2, 10, 1));
  slots.push(...ring(4, 18, 4, 8, 2));
  return slots;
})();

/** A row of `w` tiles centered within a formation `maxW` tiles wide. */
function centeredRow(w: number, maxW: number, y: number, z: number): TileSlot[] {
  const out: TileSlot[] = [];
  const x0 = maxW - w;
  for (let i = 0; i < w; i++) out.push({ x: x0 + i * 2, y, z });
  return out;
}

/** Bridge: two towers joined by a high deck. 134 tiles. */
export const BRIDGE: TileSlot[] = (() => {
  const slots: TileSlot[] = [];
  slots.push(...block(0, 26, 0, 10, 0));
  slots.push(...block(0, 6, 2, 8, 1));
  slots.push(...block(20, 26, 2, 8, 1));
  slots.push(...block(0, 4, 4, 6, 2));
  slots.push(...block(22, 26, 4, 6, 2));
  for (const x of range(8, 18)) slots.push({ x, y: 5, z: 2 });
  return slots;
})();

/** Butterfly: two thick wings and a slim body. 142 tiles. */
export const BUTTERFLY: TileSlot[] = (() => {
  const slots: TileSlot[] = [];
  slots.push(...block(0, 10, 0, 12, 0));
  slots.push(...block(16, 26, 0, 12, 0));
  slots.push(...block(12, 14, 4, 8, 0));
  slots.push(...block(2, 8, 2, 10, 1));
  slots.push(...block(18, 24, 2, 10, 1));
  slots.push(...block(4, 6, 4, 8, 2));
  slots.push(...block(20, 22, 4, 8, 2));
  return slots;
})();

/** Diamond: a rhombus that narrows to a point, stepped twice. 88 tiles. */
export const DIAMOND: TileSlot[] = (() => {
  const slots: TileSlot[] = [];
  const widths0 = [2, 4, 6, 8, 10, 10, 8, 6, 4, 2];
  widths0.forEach((w, r) => slots.push(...centeredRow(w, 10, r * 2, 0)));
  const widths1 = [2, 4, 6, 6, 4, 2];
  widths1.forEach((w, r) => slots.push(...centeredRow(w, 10, 4 + r * 2, 1)));
  slots.push(...centeredRow(2, 10, 8, 2), ...centeredRow(2, 10, 10, 2));
  return slots;
})();

/** Arena: an outer wall, a moat, and a raised center stage. 102 tiles. */
export const ARENA: TileSlot[] = (() => {
  const slots: TileSlot[] = [];
  slots.push(...ring(0, 26, 0, 12, 0));
  slots.push(...block(6, 20, 4, 8, 0));
  slots.push(...ring(4, 22, 2, 10, 1));
  slots.push(...block(10, 16, 4, 8, 2));
  slots.push({ x: 12, y: 6, z: 3 }, { x: 14, y: 6, z: 3 });
  return slots;
})();

export interface MahjongLayout {
  value: number;
  label: string;
  slots: TileSlot[];
}

export const LAYOUTS: MahjongLayout[] = [
  { value: 1, label: 'Turtle (144 tiles)', slots: TURTLE },
  { value: 2, label: 'Cross (74 tiles)', slots: CROSS },
  { value: 3, label: 'Ziggurat (132 tiles)', slots: ZIGGURAT },
  { value: 4, label: 'Fortress (128 tiles)', slots: FORTRESS },
  { value: 5, label: 'Bridge (134 tiles)', slots: BRIDGE },
  { value: 6, label: 'Butterfly (142 tiles)', slots: BUTTERFLY },
  { value: 7, label: 'Diamond (88 tiles)', slots: DIAMOND },
  { value: 8, label: 'Arena (102 tiles)', slots: ARENA },
];

export function layoutOf(variant: number): MahjongLayout {
  return LAYOUTS.find((l) => l.value === variant) ?? LAYOUTS[0]!;
}

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
function freeIn(slots: TileSlot[], occupied: boolean[], index: number): boolean {
  const slot = slots[index]!;
  let leftBlocked = false;
  let rightBlocked = false;
  for (let i = 0; i < slots.length; i++) {
    if (!occupied[i] || i === index) continue;
    const other = slots[i]!;
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
  return freeIn(layoutOf(state.variant).slots, state.tiles.map((t) => !t.removed), index);
}

/**
 * Canonical pair order, used to size the tile pool to smaller layouts: one
 * pair of every kind first (interleaved across suits), then the duplicates.
 * Flowers and seasons pair within their groups.
 */
function pairPool(count: number): [string, string][] {
  const order: [string, string][] = [];
  const onePass = (fs: [string, string], ss: [string, string]) => {
    for (let n = 1; n <= 9; n++) {
      for (const s of ['d', 'b', 'c']) order.push([`${s}${n}`, `${s}${n}`]);
    }
    for (const w of ['wE', 'wS', 'wW', 'wN']) order.push([w, w]);
    for (const g of ['gR', 'gG', 'gW']) order.push([g, g]);
    order.push(fs, ss);
  };
  onePass(['f1', 'f2'], ['s1', 's2']);
  onePass(['f3', 'f4'], ['s3', 's4']);
  return order.slice(0, count);
}

/**
 * Reverse construction: starting from the full formation, repeatedly remove
 * a random pair of currently free slots, assigning each removal a matching
 * tile pair. Replaying the removals in order solves the deal, so the deal
 * is winnable by construction.
 */
export function generateDeal(
  seed: number,
  variant = 1,
): { kinds: string[]; solution: [number, number][] } {
  const slots = layoutOf(variant).slots;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = mulberry32((seed + attempt * 0x9e3779b9) >>> 0);
    const result = tryGenerate(slots, rng);
    if (result) return result;
  }
  throw new Error('mahjong deal generation failed');
}

function tryGenerate(
  slots: TileSlot[],
  rng: Rng,
): { kinds: string[]; solution: [number, number][] } | null {
  const pairs = pairPool(slots.length / 2);
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
  }

  const occupied = slots.map(() => true);
  const kinds = new Array<string>(slots.length).fill('');
  const solution: [number, number][] = [];
  for (const [ka, kb] of pairs) {
    const free: number[] = [];
    for (let i = 0; i < slots.length; i++) {
      if (occupied[i] && freeIn(slots, occupied, i)) free.push(i);
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

export function deal(seed: number, variant = 1): MahjongState {
  const layout = layoutOf(variant);
  const { kinds } = generateDeal(seed, layout.value);
  return {
    game: 'mahjong',
    seed,
    variant: layout.value,
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
  const slots = layoutOf(state.variant).slots;
  const free: number[] = [];
  const occupied = state.tiles.map((t) => !t.removed);
  for (let i = 0; i < slots.length; i++) {
    if (occupied[i] && freeIn(slots, occupied, i)) free.push(i);
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
    const layout = layoutOf(data.state.variant);
    if (!Array.isArray(data.state.tiles) || data.state.tiles.length !== layout.slots.length) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
