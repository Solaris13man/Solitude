// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { startSudoku } from './controller';
import { deserialize } from './engine';

// Mirrors the GameShell ids the sudoku controller relies on.
const PAGE_SCAFFOLD = `
  <button id="btn-new"></button>
  <button id="btn-undo"></button>
  <button id="btn-redo"></button>
  <button id="btn-hint"></button>
  <button id="btn-autofinish" hidden></button>
  <button id="btn-stats"></button>
  <button id="btn-settings"></button>
  <span id="stat-time"></span>
  <span id="stat-moves"></span>
  <span id="stat-score"></span>
  <span id="stat-deal"></span>
  <div class="board-scroll"><div id="board" class="board"></div></div>
  <div class="numpad">
    <button data-num="1"></button><button data-num="2"></button><button data-num="3"></button>
    <button data-num="4"></button><button data-num="5"></button><button data-num="6"></button>
    <button data-num="7"></button><button data-num="8"></button><button data-num="9"></button>
    <button id="numpad-notes"></button>
    <button id="numpad-erase"></button>
  </div>
  <p id="announcer"></p>
  <div id="toast" hidden></div>
  <dialog id="settings-dialog">
    <select id="set-variant">
      <option value="1">Easy</option><option value="2">Medium</option>
      <option value="3">Hard</option><option value="4">Expert</option>
    </select>
    <p id="variant-note" hidden></p>
    <select id="set-theme"><option value="auto">auto</option><option value="light">light</option><option value="dark">dark</option></select>
    <select id="set-felt"><option value="green">green</option></select>
    <select id="set-surface"><option value="felt">felt</option></select>
    <select id="set-cardback"><option value="classic">classic</option></select>
    <input type="checkbox" id="set-animations" />
    <input type="checkbox" id="set-sounds" />
  </dialog>
  <dialog id="stats-dialog"><dl id="stats-body"></dl></dialog>
  <dialog id="win-dialog"><dl id="win-summary"></dl><button id="btn-share"></button><button id="btn-replay-deal"></button><button id="btn-play-again"></button></dialog>
  <dialog id="newgame-dialog"><button id="btn-confirm-new"></button></dialog>
`;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = PAGE_SCAFFOLD;
});

function cells(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.sudoku-cell')];
}

describe('sudoku controller', () => {
  it('boots and renders an 81-cell grid with givens', () => {
    startSudoku();
    const all = cells();
    expect(all).toHaveLength(81);
    const givens = all.filter((c) => c.classList.contains('given'));
    expect(givens.length).toBeGreaterThanOrEqual(36); // easy ≈ 40 clues
    expect(document.getElementById('stat-deal')!.textContent).toMatch(/^#\d+/);
  });

  it('entering a digit via the numpad updates the cell and persists', () => {
    startSudoku();
    const empty = cells().find((c) => !c.classList.contains('given'))!;
    empty.click();
    document.querySelector<HTMLButtonElement>('[data-num="5"]')!.click();
    expect(empty.textContent).toBe('5');
    const saved = deserialize(localStorage.getItem('solitude.game.v2.sudoku')!);
    expect(saved!.state.moves).toBe(1);
    // undo round-trips
    document.getElementById('btn-undo')!.click();
    expect(cells().find((c) => !c.classList.contains('given'))!.textContent).toBe('');
  });

  it('notes mode pencils candidates instead of filling', () => {
    startSudoku();
    const empty = cells().find((c) => !c.classList.contains('given'))!;
    empty.click();
    document.getElementById('numpad-notes')!.click();
    document.querySelector<HTMLButtonElement>('[data-num="3"]')!.click();
    expect(empty.querySelector('.sudoku-notes')).not.toBeNull();
    expect(empty.textContent).toContain('3');
  });

  it('hint reveals a correct square', () => {
    startSudoku();
    document.getElementById('btn-hint')!.click();
    const saved = deserialize(localStorage.getItem('solitude.game.v2.sudoku')!);
    const filled = saved!.state.values.filter((v) => v !== 0).length;
    const givens = saved!.state.givens.filter((v) => v !== 0).length;
    expect(filled).toBe(givens + 1);
    // the revealed square matches the solution
    const idx = saved!.state.values.findIndex(
      (v, i) => v !== 0 && saved!.state.givens[i] === 0,
    );
    expect(saved!.state.values[idx]).toBe(saved!.state.solution[idx]);
  });

  it('resumes a saved puzzle on reload', () => {
    startSudoku();
    cells().find((c) => !c.classList.contains('given'))!.click();
    document.querySelector<HTMLButtonElement>('[data-num="7"]')!.click();
    const before = localStorage.getItem('solitude.game.v2.sudoku')!;
    document.body.innerHTML = PAGE_SCAFFOLD;
    startSudoku();
    expect(document.getElementById('stat-moves')!.textContent).toBe('1');
    expect(deserialize(before)!.state.moves).toBe(1);
  });
});
