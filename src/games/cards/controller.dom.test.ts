// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { startGame } from './controller';
import { klondikeRules } from './klondike';

/**
 * Integration smoke test: the controller wired to the same element ids the
 * page provides. Catches missing-element regressions and exercises the
 * draw → undo → redo → resume flows end to end.
 */

// Must mirror the ids used in src/pages/index.astro.
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
  <div id="toast" hidden></div>
  <span id="daily-title"></span>
  <span id="daily-status"></span>
  <p id="announcer"></p>
  <dialog id="settings-dialog">
    <select id="set-variant"><option value="1">1</option><option value="3">3</option></select>
    <p id="variant-note" hidden></p>
    <select id="set-theme"><option value="auto">auto</option><option value="light">light</option><option value="dark">dark</option></select>
    <select id="set-felt"><option value="green">green</option><option value="blue">blue</option><option value="slate">slate</option><option value="crimson">crimson</option></select>
    <select id="set-cardback"><option value="classic">classic</option><option value="royal">royal</option><option value="mint">mint</option><option value="midnight">midnight</option></select>
    <input type="checkbox" id="set-lefthand" />
    <input type="checkbox" id="set-animations" />
    <input type="checkbox" id="set-sounds" />
  </dialog>
  <dialog id="stats-dialog"><dl id="stats-body"></dl></dialog>
  <dialog id="win-dialog"><dl id="win-summary"></dl><button id="btn-share"></button><button id="btn-replay-deal"></button><button id="btn-play-again"></button></dialog>
  <dialog id="newgame-dialog"><button id="btn-confirm-new"></button></dialog>
`;

function setUpPage(): void {
  document.body.innerHTML = PAGE_SCAFFOLD;
  const board = document.getElementById('board')!;
  Object.defineProperty(board, 'clientWidth', { value: 700, configurable: true });
  board.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 700, bottom: 900, width: 700, height: 900, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

function tapStock(): void {
  // The stock slot click handler drives draws.
  const slot = document.querySelector<HTMLElement>('[data-slot="stock"]')!;
  slot.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
  // happy-dom lacks pointer capture; the game only needs them to not throw.
  (Element.prototype as any).setPointerCapture ??= () => {};
  (Element.prototype as any).releasePointerCapture ??= () => {};
  setUpPage();
});

describe('daily challenge mode', () => {
  it('deals the date-derived seed and saves under its own key', async () => {
    const { dailySeed, dailyNumber } = await import('../../lib/daily');
    startGame(klondikeRules, { daily: true, forceVariant: 1 });
    tapStock();
    const saved = JSON.parse(localStorage.getItem('solitude.game.v2.klondike.daily')!);
    expect(saved.state.seed).toBe(dailySeed());
    expect(saved.state.variant).toBe(1);
    expect(document.getElementById('stat-deal')!.textContent).toBe(`Daily #${dailyNumber()}`);
    expect(document.getElementById('daily-title')!.textContent).toContain('Daily Challenge #');
    expect(document.getElementById('daily-status')!.textContent).toContain('Next deal in');
    // the regular klondike save is untouched
    expect(localStorage.getItem('solitude.game.v2.klondike')).toBeNull();
  });
});

describe('game controller', () => {
  it('boots, deals a game, and renders 52 cards', () => {
    startGame(klondikeRules);
    expect(document.querySelectorAll('#board .card')).toHaveLength(52);
    expect(document.getElementById('stat-moves')!.textContent).toBe('0');
  });

  it('drawing from the stock updates state, HUD, and save', () => {
    startGame(klondikeRules);
    tapStock();
    expect(document.getElementById('stat-moves')!.textContent).toBe('1');
    const saved = JSON.parse(localStorage.getItem('solitude.game.v2.klondike')!);
    expect(saved.state.moves).toBe(1);
    expect(saved.state.waste.length).toBe(1);
  });

  it('undo and redo round-trip through the buttons', () => {
    startGame(klondikeRules);
    tapStock();
    const undoBtn = document.getElementById('btn-undo') as HTMLButtonElement;
    const redoBtn = document.getElementById('btn-redo') as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(false);
    undoBtn.click();
    expect(document.getElementById('stat-moves')!.textContent).toBe('0');
    expect(redoBtn.disabled).toBe(false);
    redoBtn.click();
    expect(document.getElementById('stat-moves')!.textContent).toBe('1');
  });

  it('resumes a saved game on reload', () => {
    startGame(klondikeRules);
    tapStock();
    tapStock();
    const savedBefore = localStorage.getItem('solitude.game.v2.klondike')!;
    // Simulate a reload: fresh DOM, same storage.
    setUpPage();
    startGame(klondikeRules);
    expect(document.getElementById('stat-moves')!.textContent).toBe('2');
    expect(localStorage.getItem('solitude.game.v2.klondike')).not.toBeNull();
    expect(JSON.parse(savedBefore).state.moves).toBe(2);
    expect(document.getElementById('announcer')!.textContent).toContain('resumed');
  });

  it('hint announces and highlights without changing state', () => {
    startGame(klondikeRules);
    document.getElementById('btn-hint')!.click();
    expect(document.getElementById('stat-moves')!.textContent).toBe('0');
    expect(document.getElementById('announcer')!.textContent).toMatch(/^Hint/);
  });

  it('changing draw mode persists settings and flags next-deal note', () => {
    startGame(klondikeRules);
    const draw = document.getElementById('set-variant') as HTMLSelectElement;
    draw.value = '3';
    draw.dispatchEvent(new Event('change', { bubbles: true }));
    const settings = JSON.parse(localStorage.getItem('solitude.settings.v1')!);
    expect(settings.variants.klondike).toBe(3);
    expect((document.getElementById('variant-note') as HTMLElement).hidden).toBe(false);
    // New deal picks up the new mode: a draw should now move 3 cards.
    // (the game hasn't started, so no confirmation is needed)
    document.getElementById('btn-new')!.click();
    tapStock();
    const saved = JSON.parse(localStorage.getItem('solitude.game.v2.klondike')!);
    expect(saved.state.waste.length).toBe(3);
  });

  it('asks for confirmation and records an abandoned game as a loss', () => {
    startGame(klondikeRules);
    tapStock();
    document.getElementById('btn-new')!.click();
    // A started game is never abandoned silently: stats unchanged until confirmed.
    expect(localStorage.getItem('solitude.stats.v3.klondike')).toBeNull();
    document.getElementById('btn-confirm-new')!.click();
    const stats = JSON.parse(localStorage.getItem('solitude.stats.v3.klondike')!);
    expect(stats.variants.v1.gamesPlayed).toBe(1);
    expect(stats.variants.v1.gamesWon).toBe(0);
    expect(stats.variants.v1.currentStreak).toBe(0);
  });
});
