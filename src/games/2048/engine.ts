import { mulberry32 } from '../cards/rng';

/**
 * 2048: slide tiles, merge equals, reach 2048 (and beyond). Tiles keep
 * stable ids so the renderer can animate slides and merges. Spawns are a
 * deterministic function of (seed, spawn counter), so games are
 * reproducible per seed + move sequence with nothing extra to persist.
 */

export interface Tile {
  id: number;
  value: number;
  r: number;
  c: number;
}

export interface G2048State {
  game: '2048';
  seed: number;
  variant: number;
  tiles: Tile[];
  nextId: number;
  spawns: number;
  score: number;
  moves: number;
  /** Reached 2048 at least once (celebrated once; play continues). */
  reached2048: boolean;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MoveEvents {
  moved: boolean;
  merges: { at: { r: number; c: number }; value: number }[];
  /** Tiles consumed by merges, with their final (slid-onto) coordinates —
   *  the renderer slides them in, then removes their elements. */
  removedTiles: Tile[];
  spawned: Tile | null;
}

const SIZE = 4;

function spawnTile(state: G2048State): Tile | null {
  const occupied = new Set(state.tiles.map((t) => t.r * SIZE + t.c));
  const empty: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (!occupied.has(i)) empty.push(i);
  if (empty.length === 0) return null;
  const rng = mulberry32((state.seed ^ (state.spawns * 0x9e3779b9)) >>> 0);
  const cell = empty[Math.floor(rng() * empty.length)]!;
  const value = rng() < 0.9 ? 2 : 4;
  state.spawns++;
  const tile: Tile = { id: state.nextId++, value, r: Math.floor(cell / SIZE), c: cell % SIZE };
  state.tiles.push(tile);
  return tile;
}

export function deal(seed: number): G2048State {
  const state: G2048State = {
    game: '2048',
    seed,
    variant: 0,
    tiles: [],
    nextId: 1,
    spawns: 0,
    score: 0,
    moves: 0,
    reached2048: false,
  };
  spawnTile(state);
  spawnTile(state);
  return state;
}

/** Lines of cell coordinates in traversal order for a direction. */
function lines(dir: Direction): { r: number; c: number }[][] {
  const out: { r: number; c: number }[][] = [];
  for (let i = 0; i < SIZE; i++) {
    const line: { r: number; c: number }[] = [];
    for (let j = 0; j < SIZE; j++) {
      switch (dir) {
        case 'left': line.push({ r: i, c: j }); break;
        case 'right': line.push({ r: i, c: SIZE - 1 - j }); break;
        case 'up': line.push({ r: j, c: i }); break;
        case 'down': line.push({ r: SIZE - 1 - j, c: i }); break;
      }
    }
    out.push(line);
  }
  return out;
}

/** Apply a move; mutates and reports what happened (for animation). */
export function move(state: G2048State, dir: Direction): MoveEvents {
  const byCell = new Map<string, Tile>();
  for (const t of state.tiles) byCell.set(`${t.r},${t.c}`, t);
  const merges: MoveEvents['merges'] = [];
  const removed = new Set<number>();
  let moved = false;

  for (const line of lines(dir)) {
    const tilesInLine = line
      .map((cell) => byCell.get(`${cell.r},${cell.c}`))
      .filter((t): t is Tile => !!t);
    let target = 0;
    let previous: Tile | null = null;
    for (const tile of tilesInLine) {
      if (previous && previous.value === tile.value && !removed.has(previous.id)) {
        // merge into previous: previous doubles, this tile slides onto it
        const dest = line[target - 1]!;
        if (tile.r !== dest.r || tile.c !== dest.c) moved = true;
        tile.r = dest.r;
        tile.c = dest.c;
        previous.value *= 2;
        state.score += previous.value;
        if (previous.value === 2048) state.reached2048 = true;
        merges.push({ at: { r: dest.r, c: dest.c }, value: previous.value });
        removed.add(tile.id);
        // mark the merged tile as consumed for pairing purposes
        previous = null;
      } else {
        const dest = line[target]!;
        if (tile.r !== dest.r || tile.c !== dest.c) moved = true;
        tile.r = dest.r;
        tile.c = dest.c;
        target++;
        previous = tile;
      }
    }
  }

  if (!moved) return { moved: false, merges: [], removedTiles: [], spawned: null };
  const removedTiles = state.tiles.filter((t) => removed.has(t.id)).map((t) => ({ ...t }));
  state.tiles = state.tiles.filter((t) => !removed.has(t.id));
  state.moves++;
  const spawned = spawnTile(state);
  return { moved: true, merges, removedTiles, spawned };
}

export function canMove(state: G2048State): boolean {
  if (state.tiles.length < SIZE * SIZE) return true;
  const grid: number[][] = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  for (const t of state.tiles) grid[t.r]![t.c] = t.value;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r]![c]!;
      if (r + 1 < SIZE && grid[r + 1]![c] === v) return true;
      if (c + 1 < SIZE && grid[r]![c + 1] === v) return true;
    }
  }
  return false;
}

export function isOver(state: G2048State): boolean {
  return !canMove(state);
}

export function bestTile(state: G2048State): number {
  return state.tiles.reduce((m, t) => Math.max(m, t.value), 0);
}

export function cloneState(state: G2048State): G2048State {
  return { ...state, tiles: state.tiles.map((t) => ({ ...t })) };
}

export interface Serialized2048 {
  v: 1;
  state: G2048State;
  elapsedMs: number;
}

export function serialize(state: G2048State, elapsedMs: number): string {
  return JSON.stringify({ v: 1, state, elapsedMs } satisfies Serialized2048);
}

export function deserialize(json: string): Serialized2048 | null {
  try {
    const data = JSON.parse(json) as Serialized2048;
    if (data.v !== 1 || data.state?.game !== '2048') return null;
    if (!Array.isArray(data.state.tiles)) return null;
    return data;
  } catch {
    return null;
  }
}
