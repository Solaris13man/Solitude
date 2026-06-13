import { mulberry32 } from '../cards/rng';

/**
 * Minesweeper. Mines are placed on the first reveal (seeded by the deal
 * seed, excluding the clicked cell and its neighbors), so the first click
 * always opens safely and the same seed + same first click reproduces the
 * same board.
 */

export interface MinesweeperState {
  game: 'minesweeper';
  seed: number;
  /** 1 easy, 2 medium, 3 expert */
  variant: number;
  width: number;
  height: number;
  mineCount: number;
  minesPlaced: boolean;
  mine: boolean[];
  adjacent: number[];
  revealed: boolean[];
  flagged: boolean[];
  moves: number;
  /** 'playing' | 'won' | 'lost' */
  status: 'playing' | 'won' | 'lost';
}

export const DIFFICULTIES = [
  { value: 1, label: 'Easy (9×9, 10 mines)', width: 9, height: 9, mines: 10 },
  { value: 2, label: 'Medium (16×16, 40 mines)', width: 16, height: 16, mines: 40 },
  { value: 3, label: 'Expert (30×16, 99 mines)', width: 30, height: 16, mines: 99 },
] as const;

export function difficultyOf(variant: number) {
  return DIFFICULTIES.find((d) => d.value === variant) ?? DIFFICULTIES[0];
}

export function deal(seed: number, variant = 1): MinesweeperState {
  const d = difficultyOf(variant);
  const size = d.width * d.height;
  return {
    game: 'minesweeper',
    seed,
    variant: d.value,
    width: d.width,
    height: d.height,
    mineCount: d.mines,
    minesPlaced: false,
    mine: new Array(size).fill(false),
    adjacent: new Array(size).fill(0),
    revealed: new Array(size).fill(false),
    flagged: new Array(size).fill(false),
    moves: 0,
    status: 'playing',
  };
}

export function neighbors(state: MinesweeperState, i: number): number[] {
  const out: number[] = [];
  const r = Math.floor(i / state.width);
  const c = i % state.width;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < state.height && nc >= 0 && nc < state.width) {
        out.push(nr * state.width + nc);
      }
    }
  }
  return out;
}

/** Seeded placement excluding the first-clicked cell and its neighbors. */
export function placeMines(state: MinesweeperState, safe: number): void {
  const rng = mulberry32(state.seed);
  const exclude = new Set([safe, ...neighbors(state, safe)]);
  const size = state.width * state.height;
  const candidates: number[] = [];
  for (let i = 0; i < size; i++) if (!exclude.has(i)) candidates.push(i);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  for (const i of candidates.slice(0, state.mineCount)) state.mine[i] = true;
  for (let i = 0; i < size; i++) {
    state.adjacent[i] = neighbors(state, i).filter((n) => state.mine[n]).length;
  }
  state.minesPlaced = true;
}

function floodReveal(state: MinesweeperState, start: number): void {
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (state.revealed[i] || state.flagged[i]) continue;
    state.revealed[i] = true;
    if (state.adjacent[i] === 0 && !state.mine[i]) {
      for (const n of neighbors(state, i)) {
        if (!state.revealed[n]) stack.push(n);
      }
    }
  }
}

function checkWin(state: MinesweeperState): void {
  for (let i = 0; i < state.mine.length; i++) {
    if (!state.mine[i] && !state.revealed[i]) return;
  }
  state.status = 'won';
  // flag the remaining mines as a courtesy
  for (let i = 0; i < state.mine.length; i++) {
    if (state.mine[i]) state.flagged[i] = true;
  }
}

export function reveal(state: MinesweeperState, i: number): void {
  if (state.status !== 'playing' || state.revealed[i] || state.flagged[i]) return;
  if (!state.minesPlaced) placeMines(state, i);
  state.moves++;
  if (state.mine[i]) {
    state.status = 'lost';
    state.revealed[i] = true;
    for (let m = 0; m < state.mine.length; m++) {
      if (state.mine[m]) state.revealed[m] = true;
    }
    return;
  }
  floodReveal(state, i);
  checkWin(state);
}

export function toggleFlag(state: MinesweeperState, i: number): void {
  if (state.status !== 'playing' || state.revealed[i]) return;
  state.flagged[i] = !state.flagged[i];
  state.moves++;
}

/**
 * Chord: when a revealed number has exactly that many flags around it,
 * reveal its remaining neighbors.
 */
export function chord(state: MinesweeperState, i: number): void {
  if (state.status !== 'playing' || !state.revealed[i] || state.adjacent[i] === 0) return;
  const ns = neighbors(state, i);
  const flags = ns.filter((n) => state.flagged[n]).length;
  if (flags !== state.adjacent[i]) return;
  for (const n of ns) {
    if (!state.revealed[n] && !state.flagged[n]) {
      reveal(state, n);
      if (state.status !== 'playing') return;
    }
  }
}

export function flagsRemaining(state: MinesweeperState): number {
  return state.mineCount - state.flagged.filter(Boolean).length;
}

export function cloneState(state: MinesweeperState): MinesweeperState {
  return {
    ...state,
    mine: state.mine.slice(),
    adjacent: state.adjacent.slice(),
    revealed: state.revealed.slice(),
    flagged: state.flagged.slice(),
  };
}

export interface SerializedMinesweeper {
  v: 1;
  state: MinesweeperState;
  elapsedMs: number;
}

export function serialize(state: MinesweeperState, elapsedMs: number): string {
  return JSON.stringify({ v: 1, state, elapsedMs } satisfies SerializedMinesweeper);
}

export function deserialize(json: string): SerializedMinesweeper | null {
  try {
    const data = JSON.parse(json) as SerializedMinesweeper;
    if (data.v !== 1 || data.state?.game !== 'minesweeper') return null;
    if (!Array.isArray(data.state.mine)) return null;
    return data;
  } catch {
    return null;
  }
}
