import { mulberry32, type Rng } from '../cards/rng';

/**
 * Sudoku engine: seeded puzzle generation with a uniqueness-checked solver,
 * so every deal is reproducible from its seed and has exactly one solution.
 */

export interface SudokuState {
  game: 'sudoku';
  seed: number;
  /** Difficulty 1 (easy) … 4 (expert). */
  variant: number;
  /** 81 cells; 0 = empty. Fixed clues from the deal. */
  givens: number[];
  /** Current board incl. givens and player entries. */
  values: number[];
  /** Pencil-mark bitmask per cell (bit n-1 = note n). */
  notes: number[];
  solution: number[];
  moves: number;
  mistakes: number;
}

export const DIFFICULTIES = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Hard' },
  { value: 4, label: 'Expert' },
] as const;

/** Target clue counts per difficulty (removal stops when reached). */
const TARGET_GIVENS: Record<number, number> = { 1: 40, 2: 34, 3: 29, 4: 25 };

const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

export function peersConflict(a: number, b: number): boolean {
  return a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));
}

function shuffled<T>(arr: T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Bitmask of candidates for cell i in grid (bit n-1 = digit n allowed). */
function candidates(grid: number[], i: number): number {
  let used = 0;
  const r = rowOf(i) * 9;
  const c = colOf(i);
  const br = Math.floor(rowOf(i) / 3) * 27;
  const bc = Math.floor(colOf(i) / 3) * 3;
  for (let k = 0; k < 9; k++) {
    used |= 1 << (grid[r + k]! - 1);
    used |= 1 << (grid[k * 9 + c]! - 1);
    used |= 1 << (grid[br + Math.floor(k / 3) * 9 + bc + (k % 3)]! - 1);
  }
  // bit -1 (value 0 → 1 << -1) is garbage but harmless: mask to 9 bits
  return ~used & 0x1ff;
}

/** Fill the grid in place via backtracking; candidate order is rng-driven. */
function fillGrid(grid: number[], rng: Rng): boolean {
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0) continue;
    const mask = candidates(grid, i);
    const count = popCount(mask);
    if (count === 0) return false;
    if (count < bestCount) {
      best = i;
      bestMask = mask;
      bestCount = count;
      if (count === 1) break;
    }
  }
  if (best === -1) return true;
  const digits = shuffled(
    Array.from({ length: 9 }, (_, d) => d + 1).filter((d) => bestMask & (1 << (d - 1))),
    rng,
  );
  for (const d of digits) {
    grid[best] = d;
    if (fillGrid(grid, rng)) return true;
  }
  grid[best] = 0;
  return false;
}

function popCount(x: number): number {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
}

/** Count solutions, stopping at `limit` (2 is enough for uniqueness). */
export function countSolutions(grid: number[], limit = 2): number {
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0) continue;
    const mask = candidates(grid, i);
    const count = popCount(mask);
    if (count === 0) return 0;
    if (count < bestCount) {
      best = i;
      bestMask = mask;
      bestCount = count;
      if (count === 1) break;
    }
  }
  if (best === -1) return 1;
  let found = 0;
  for (let d = 1; d <= 9; d++) {
    if (!(bestMask & (1 << (d - 1)))) continue;
    grid[best] = d;
    found += countSolutions(grid, limit - found);
    grid[best] = 0;
    if (found >= limit) return found;
  }
  return found;
}

export function deal(seed: number, difficulty: number): SudokuState {
  const variant = difficulty >= 1 && difficulty <= 4 ? Math.floor(difficulty) : 1;
  const rng = mulberry32(seed);
  const solution = new Array<number>(81).fill(0);
  fillGrid(solution, rng);
  const puzzle = solution.slice();
  const target = TARGET_GIVENS[variant]!;
  let givenCount = 81;
  for (const i of shuffled(Array.from({ length: 81 }, (_, k) => k), rng)) {
    if (givenCount <= target) break;
    const backup = puzzle[i]!;
    puzzle[i] = 0;
    if (countSolutions(puzzle.slice()) !== 1) {
      puzzle[i] = backup;
    } else {
      givenCount--;
    }
  }
  return {
    game: 'sudoku',
    seed,
    variant,
    givens: puzzle.slice(),
    values: puzzle.slice(),
    notes: new Array<number>(81).fill(0),
    solution,
    moves: 0,
    mistakes: 0,
  };
}

export function cloneState(state: SudokuState): SudokuState {
  return {
    ...state,
    givens: state.givens.slice(),
    values: state.values.slice(),
    notes: state.notes.slice(),
    solution: state.solution.slice(),
  };
}

export function isGiven(state: SudokuState, i: number): boolean {
  return state.givens[i] !== 0;
}

export function isWon(state: SudokuState): boolean {
  return state.values.every((v, i) => v === state.solution[i]);
}

/** Indexes of cells whose value collides with a peer (row/col/box). */
export function conflicts(state: SudokuState): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < 81; i++) {
    const v = state.values[i]!;
    if (v === 0) continue;
    for (let j = i + 1; j < 81; j++) {
      if (state.values[j] === v && peersConflict(i, j)) {
        bad.add(i);
        bad.add(j);
      }
    }
  }
  return bad;
}

/** Set or clear (v = 0) a cell. Mutates; counts a mistake on wrong entries. */
export function setCell(state: SudokuState, i: number, v: number): void {
  if (isGiven(state, i) || v < 0 || v > 9) return;
  if (state.values[i] === v) return;
  state.values[i] = v;
  state.notes[i] = 0;
  if (v !== 0) {
    // entering a digit clears matching pencil marks among peers
    for (let j = 0; j < 81; j++) {
      if (peersConflict(i, j)) state.notes[j]! &= ~(1 << (v - 1));
    }
    if (v !== state.solution[i]) state.mistakes++;
  }
  state.moves++;
}

export function toggleNote(state: SudokuState, i: number, v: number): void {
  if (isGiven(state, i) || state.values[i] !== 0 || v < 1 || v > 9) return;
  state.notes[i]! ^= 1 << (v - 1);
  state.moves++;
}

/** Reveal the correct digit for a cell (the hint action). */
export function revealCell(state: SudokuState, i: number): void {
  if (isGiven(state, i) || state.values[i] === state.solution[i]) return;
  state.values[i] = state.solution[i]!;
  state.notes[i] = 0;
  for (let j = 0; j < 81; j++) {
    if (peersConflict(i, j)) state.notes[j]! &= ~(1 << (state.solution[i]! - 1));
  }
  state.moves++;
}

/** First empty-or-wrong cell, preferring truly empty ones (for hints). */
export function hintTarget(state: SudokuState, preferred: number | null): number | null {
  if (
    preferred !== null &&
    !isGiven(state, preferred) &&
    state.values[preferred] !== state.solution[preferred]
  ) {
    return preferred;
  }
  let wrong: number | null = null;
  for (let i = 0; i < 81; i++) {
    if (isGiven(state, i)) continue;
    if (state.values[i] === 0) return i;
    if (state.values[i] !== state.solution[i] && wrong === null) wrong = i;
  }
  return wrong;
}

export interface SerializedSudoku {
  v: 1;
  state: SudokuState;
  elapsedMs: number;
}

export function serialize(state: SudokuState, elapsedMs: number): string {
  return JSON.stringify({ v: 1, state, elapsedMs } satisfies SerializedSudoku);
}

export function deserialize(json: string): SerializedSudoku | null {
  try {
    const data = JSON.parse(json) as SerializedSudoku;
    if (data.v !== 1 || data.state?.game !== 'sudoku') return null;
    if (!Array.isArray(data.state.values) || data.state.values.length !== 81) return null;
    return data;
  } catch {
    return null;
  }
}
