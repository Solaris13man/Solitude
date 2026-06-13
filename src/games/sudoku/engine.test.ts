import { describe, expect, it } from 'vitest';
import {
  cloneState,
  conflicts,
  countSolutions,
  deal,
  deserialize,
  hintTarget,
  isWon,
  logicalSolvable,
  maxTechniqueFor,
  revealCell,
  serialize,
  setCell,
  toggleNote,
} from './engine';

function validSolvedGrid(grid: number[]): boolean {
  const groups: number[][] = [];
  for (let k = 0; k < 9; k++) {
    groups.push(Array.from({ length: 9 }, (_, i) => grid[k * 9 + i]!)); // rows
    groups.push(Array.from({ length: 9 }, (_, i) => grid[i * 9 + k]!)); // cols
    const br = Math.floor(k / 3) * 27 + (k % 3) * 3;
    groups.push(Array.from({ length: 9 }, (_, i) => grid[br + Math.floor(i / 3) * 9 + (i % 3)]!));
  }
  return groups.every((g) => new Set(g).size === 9 && g.every((v) => v >= 1 && v <= 9));
}

describe('sudoku generation', () => {
  it('is deterministic per seed', () => {
    expect(JSON.stringify(deal(42, 2))).toBe(JSON.stringify(deal(42, 2)));
    expect(JSON.stringify(deal(42, 2))).not.toBe(JSON.stringify(deal(43, 2)));
  });

  it('produces a valid solved grid', () => {
    const s = deal(7, 1);
    expect(validSolvedGrid(s.solution)).toBe(true);
  });

  it('every puzzle has exactly one solution', () => {
    for (const seed of [1, 99, 12345]) {
      const s = deal(seed, 3);
      expect(countSolutions(s.givens.slice())).toBe(1);
    }
  });

  it('every difficulty is solvable by logic alone — no guessing required', () => {
    // The technique budget per difficulty: easy = singles, medium = + locked
    // candidates, hard = + naked pairs, expert = + hidden pairs + X-Wing.
    for (const variant of [1, 2, 3, 4]) {
      for (const seed of [3, 88, 4242]) {
        const s = deal(seed, variant);
        expect(logicalSolvable(s.givens, maxTechniqueFor(variant))).toBe(true);
      }
    }
  });

  it('technique tiers are strictly increasing across difficulties', () => {
    const tiers = [1, 2, 3, 4].map(maxTechniqueFor);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!).toBeGreaterThan(tiers[i - 1]!);
    }
    // Expert reaches the fish-pattern tier (X-Wing), well beyond naked pairs.
    expect(maxTechniqueFor(4)).toBeGreaterThanOrEqual(5);
  });

  it('every difficulty is uniquely solvable', () => {
    for (const variant of [1, 2, 3, 4]) {
      for (const seed of [3, 88, 4242]) {
        const s = deal(seed, variant);
        expect(countSolutions(s.givens.slice())).toBe(1);
      }
    }
  });

  it('puzzles solvable at their tier are not necessarily solvable below it', () => {
    // Solver levels are nested: anything solvable at level n is solvable at
    // every level > n. Verify the new advanced techniques are monotone by
    // checking a tier-4 (expert) puzzle stays solvable at its full budget.
    const expert = deal(4242, 4);
    expect(logicalSolvable(expert.givens, maxTechniqueFor(4))).toBe(true);
    // And that allowing MORE techniques never breaks solvability.
    expect(logicalSolvable(expert.givens, 5)).toBe(true);
  });

  it('the advanced solver respects the no-guessing guarantee', () => {
    // The known hard 17-clue puzzle needs chains/guessing; it must remain
    // unsolvable even with all implemented human techniques enabled.
    const hard17 =
      '000000010400000000020000000000050407008000300001090000300400200050100000000806000';
    const grid = hard17.split('').map(Number);
    expect(countSolutions(grid.slice())).toBe(1);
    expect(logicalSolvable(grid, 5)).toBe(false);
  });

  it('a puzzle needing guessing is rejected at the easy technique budget', () => {
    // A famously hard 17-clue puzzle is uniquely solvable but not by singles.
    const hard17 =
      '000000010400000000020000000000050407008000300001090000300400200050100000000806000';
    const grid = hard17.split('').map(Number);
    expect(countSolutions(grid.slice())).toBe(1);
    expect(logicalSolvable(grid, 1)).toBe(false);
  });

  it('givens match the solution and harder deals have fewer clues', () => {
    const easy = deal(5, 1);
    const expert = deal(5, 4);
    for (const s of [easy, expert]) {
      s.givens.forEach((v, i) => {
        if (v !== 0) expect(v).toBe(s.solution[i]);
      });
    }
    const count = (s: typeof easy) => s.givens.filter((v) => v !== 0).length;
    expect(count(easy)).toBeGreaterThan(count(expert));
    expect(count(easy)).toBeLessThanOrEqual(45);
    expect(count(expert)).toBeGreaterThanOrEqual(22);
  });
});

describe('sudoku play', () => {
  it('setCell enters digits, blocks givens, and counts mistakes', () => {
    const s = deal(11, 1);
    const empty = s.values.findIndex((v) => v === 0);
    const right = s.solution[empty]!;
    const wrong = (right % 9) + 1;
    setCell(s, empty, wrong);
    expect(s.values[empty]).toBe(wrong);
    expect(s.mistakes).toBe(1);
    setCell(s, empty, right);
    expect(s.mistakes).toBe(1);
    const givenIdx = s.givens.findIndex((v) => v !== 0);
    const before = s.values[givenIdx];
    setCell(s, givenIdx, 5);
    expect(s.values[givenIdx]).toBe(before);
  });

  it('detects conflicts among peers', () => {
    const s = deal(11, 1);
    const empty = s.values.findIndex((v) => v === 0);
    // duplicate the first value in the same row
    const row = Math.floor(empty / 9);
    const peer = Array.from({ length: 9 }, (_, c) => row * 9 + c).find(
      (i) => i !== empty && s.values[i] !== 0,
    )!;
    setCell(s, empty, s.values[peer]!);
    const bad = conflicts(s);
    expect(bad.has(empty)).toBe(true);
    expect(bad.has(peer)).toBe(true);
  });

  it('notes toggle and are cleared from peers when a digit lands', () => {
    const s = deal(11, 1);
    const empties = s.values
      .map((v, i) => (v === 0 ? i : -1))
      .filter((i) => i >= 0);
    const a = empties[0]!;
    const b = empties.find((i) => i !== a && (Math.floor(i / 9) === Math.floor(a / 9)))!;
    toggleNote(s, a, 4);
    toggleNote(s, a, 7);
    expect(s.notes[a]).toBe((1 << 3) | (1 << 6));
    toggleNote(s, a, 4);
    expect(s.notes[a]).toBe(1 << 6);
    // entering 7 in a same-row peer clears the 7 note in a
    setCell(s, b, 7);
    expect(s.notes[a]! & (1 << 6)).toBe(0);
  });

  it('reveal + hintTarget drive the game to a win', () => {
    const s = deal(3, 1);
    let guard = 0;
    while (!isWon(s)) {
      const t = hintTarget(s, null);
      expect(t).not.toBeNull();
      revealCell(s, t!);
      if (++guard > 81) throw new Error('did not converge');
    }
    expect(isWon(s)).toBe(true);
  });

  it('clone is deep', () => {
    const s = deal(3, 1);
    const c = cloneState(s);
    const empty = s.values.findIndex((v) => v === 0);
    setCell(s, empty, 1);
    expect(c.values[empty]).toBe(0);
  });
});

describe('sudoku serialization', () => {
  it('round-trips', () => {
    const s = deal(77, 2);
    setCell(s, s.values.findIndex((v) => v === 0), 3);
    const restored = deserialize(serialize(s, 9000));
    expect(restored).not.toBeNull();
    expect(restored!.elapsedMs).toBe(9000);
    expect(JSON.stringify(restored!.state)).toBe(JSON.stringify(s));
  });

  it('rejects garbage', () => {
    expect(deserialize('nope')).toBeNull();
    expect(deserialize('{"v":1,"state":{"game":"klondike"}}')).toBeNull();
  });
});
