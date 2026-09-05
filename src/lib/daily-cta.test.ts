// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { initDailyCta } from './daily-cta';
import { dailyGame, recordDailyWin, utcDateKey } from './daily';

function slot(): HTMLElement {
  document.body.innerHTML = '<p data-daily-cta hidden></p>';
  return document.querySelector<HTMLElement>('[data-daily-cta]')!;
}

function solveToday(): void {
  recordDailyWin(utcDateKey(), { timeMs: 1000, moves: 1, score: 1, game: 'freecell' });
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/freecell/');
});

describe('daily CTA', () => {
  it('points an unsolved day at today’s challenge', () => {
    const el = slot();
    initDailyCta();
    const link = el.querySelector('a')!;
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain(dailyGame().label);
    expect(link.getAttribute('href')).toBe(`${dailyGame().path}?daily=1`);
    expect(link.textContent).toBe('Play it →');
  });

  it('switches to the streak view once the day is solved', () => {
    solveToday();
    const el = slot();
    initDailyCta();
    expect(el.textContent).toContain('1-day streak');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/daily-challenge/');
  });

  it('stays hidden while the daily itself is being played', () => {
    window.history.replaceState({}, '', '/freecell/?daily=1');
    const el = slot();
    initDailyCta();
    expect(el.hidden).toBe(true);
  });

  it('refreshes on a result without stacking links', () => {
    const el = slot();
    initDailyCta();
    solveToday(); // recordDailyWin dispatches cardhearth:result
    expect(el.querySelectorAll('a')).toHaveLength(1);
    expect(el.textContent).toContain('1-day streak');
  });

  it('is inert on pages with no slot', () => {
    document.body.innerHTML = '';
    expect(() => initDailyCta()).not.toThrow();
  });
});
