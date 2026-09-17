// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { initDailyStrip } from './daily-strip';
import { dailyGame, recordDailyWin, utcDateKey } from './daily';

function mount(): HTMLElement {
  document.body.innerHTML = `
    <aside class="daily-strip" data-daily-strip>
      <a href="/daily-challenge/" data-daily-strip-link data-ch-placement="game_page">
        <span data-daily-strip-title>Daily Challenge</span>
        <span data-daily-strip-status>One puzzle a day, the same for everyone — build a streak.</span>
      </a>
    </aside>`;
  return document.querySelector<HTMLElement>('[data-daily-strip]')!;
}

const titleOf = (s: HTMLElement) =>
  s.querySelector<HTMLElement>('[data-daily-strip-title]')!.textContent ?? '';
const statusOf = (s: HTMLElement) =>
  s.querySelector<HTMLElement>('[data-daily-strip-status]')!.textContent ?? '';
const linkOf = (s: HTMLElement) => s.querySelector<HTMLAnchorElement>('[data-daily-strip-link]')!;

function solveToday(): void {
  recordDailyWin(utcDateKey(), { timeMs: 1000, moves: 1, score: 1, game: 'freecell' });
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/freecell/');
});

describe('initDailyStrip', () => {
  it("names today's challenge and points at it", () => {
    const strip = mount();
    initDailyStrip();
    const entry = dailyGame();
    expect(strip.hidden).toBe(false);
    expect(titleOf(strip)).toContain(entry.label);
    expect(linkOf(strip).getAttribute('href')).toBe(`${entry.path}?daily=1`);
  });

  it('switches to a done state and sends solved players to the hub', () => {
    const strip = mount();
    solveToday();
    initDailyStrip();
    expect(titleOf(strip)).toContain('streak');
    expect(statusOf(strip)).toContain('tomorrow');
    expect(linkOf(strip).getAttribute('href')).toBe('/daily-challenge/');
    expect(strip.classList.contains('daily-strip-solved')).toBe(true);
    expect(linkOf(strip).dataset.chPlacement).toBe('game_page_solved');
  });

  it('hides itself while the daily is already being played', () => {
    window.history.replaceState({}, '', '/freecell/?daily=1');
    const strip = mount();
    initDailyStrip();
    expect(strip.hidden).toBe(true);
  });

  it('refreshes when a result lands, without a reload', () => {
    const strip = mount();
    initDailyStrip();
    expect(strip.classList.contains('daily-strip-solved')).toBe(false);
    solveToday(); // recordDailyWin dispatches cardhearth:result
    expect(strip.classList.contains('daily-strip-solved')).toBe(true);
  });

  it('is a no-op on a page with no strip', () => {
    document.body.innerHTML = '<main></main>';
    expect(() => initDailyStrip()).not.toThrow();
  });

  it('leaves the server-rendered copy alone when storage is unusable', () => {
    const strip = mount();
    const before = statusOf(strip);
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('storage disabled');
    };
    try {
      expect(() => initDailyStrip()).not.toThrow();
      expect(statusOf(strip)).toBe(before);
    } finally {
      Storage.prototype.getItem = getItem;
    }
  });
});
