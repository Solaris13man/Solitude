// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { GameSession, pageGameSession, resetPageGameSession } from './game-session';
import { initLinkTracking, resetLinkTracking } from './analytics';

interface Recorded {
  event: string;
  props?: Record<string, unknown>;
}

/** The debug buffer `track()` always mirrors to, whatever provider is on. */
function events(): Recorded[] {
  return ((window as unknown as { __chEvents?: Recorded[] }).__chEvents ?? []).map((e) => ({
    event: e.event,
    props: e.props,
  }));
}

function names(): string[] {
  return events().map((e) => e.event);
}

function count(name: string): number {
  return names().filter((n) => n === name).length;
}

function propsOf(name: string): Record<string, unknown> | undefined {
  return events().find((e) => e.event === name)?.props;
}

beforeEach(() => {
  (window as unknown as { __chEvents?: Recorded[] }).__chEvents = [];
  document.body.innerHTML = '';
  resetPageGameSession();
  resetLinkTracking();
});

describe('GameSession', () => {
  it('fires game_view exactly once however often it is called', () => {
    const s = new GameSession('freecell');
    s.view();
    s.view();
    s.view();
    expect(count('game_view')).toBe(1);
    expect(propsOf('game_view')).toEqual({ game: 'freecell' });
  });

  it('does not treat dealing as starting', () => {
    const s = new GameSession('freecell');
    s.deal();
    s.deal();
    expect(count('game_start')).toBe(0);
  });

  it('fires game_start once per deal, on interaction only', () => {
    const s = new GameSession('spades');
    s.deal();
    s.markStarted(0);
    s.markStarted(0);
    s.markStarted(0);
    expect(count('game_start')).toBe(1);
    expect(propsOf('game_start')).toEqual({ game: 'spades', variant: 0 });

    // A fresh deal re-arms the guard.
    s.deal();
    s.markStarted(0);
    expect(count('game_start')).toBe(2);
  });

  it('fires game_complete once per deal', () => {
    const s = new GameSession('hearts');
    s.deal();
    s.markStarted();
    s.complete({ won: true, durationSeconds: 92.4 });
    s.complete({ won: true, durationSeconds: 92.4 });
    expect(count('game_complete')).toBe(1);
    expect(propsOf('game_complete')).toEqual({
      game: 'hearts',
      result: 'won',
      duration_seconds: 92,
    });
  });

  it('backfills a start so completions can never outnumber starts', () => {
    const s = new GameSession('freecell');
    s.deal();
    // Resumed save / auto-finish: finished without a recorded interaction.
    s.complete({ won: true });
    expect(count('game_start')).toBe(1);
    expect(count('game_complete')).toBe(1);
  });

  it('prefers an explicit result label over the won flag', () => {
    const s = new GameSession('2048');
    s.complete({ won: false, result: 'reached_1024' });
    expect(propsOf('game_complete')).toMatchObject({ result: 'reached_1024' });
  });

  it('omits an unusable duration rather than sending a bogus one', () => {
    const s = new GameSession('freecell');
    s.complete({ won: true, durationSeconds: Number.NaN });
    expect(propsOf('game_complete')).not.toHaveProperty('duration_seconds');

    const t = new GameSession('spades');
    t.complete({ won: true, durationSeconds: -5 });
    expect(events().filter((e) => e.event === 'game_complete')[1]?.props).not.toHaveProperty(
      'duration_seconds',
    );
  });

  it('counts every replay — they are all real', () => {
    const s = new GameSession('freecell');
    s.replay('new_deal');
    s.replay('same_deal');
    expect(count('game_replay')).toBe(2);
    expect(propsOf('game_replay')).toEqual({ game: 'freecell', mode: 'new_deal' });
  });
});

describe('pageGameSession', () => {
  it('returns null on a page with no game', () => {
    expect(pageGameSession()).toBeNull();
  });

  it('reads the game id from the shell and memoises one instance', () => {
    document.body.innerHTML = '<main data-game-id="freecell"></main>';
    const a = pageGameSession();
    const b = pageGameSession();
    expect(a?.game).toBe('freecell');
    expect(b).toBe(a);
    // The shared instance means game_view cannot double-fire across callers.
    a?.view();
    b?.view();
    expect(count('game_view')).toBe(1);
  });
});

describe('initLinkTracking', () => {
  it('emits related_game_click with both ends of the hop', () => {
    document.body.innerHTML =
      '<main data-game-id="spades"><a href="/hearts/" data-ch-track="related_game" data-ch-to="hearts">Hearts</a></main>';
    initLinkTracking();
    document.querySelector<HTMLElement>('a')!.click();
    expect(propsOf('related_game_click')).toEqual({ from_game: 'spades', to_game: 'hearts' });
  });

  it('emits rules_click attributed to the page game', () => {
    document.body.innerHTML =
      '<main data-game-id="freecell"><a href="/guides/freecell-rules/" data-ch-track="rules">Rules</a></main>';
    initLinkTracking();
    document.querySelector<HTMLElement>('a')!.click();
    expect(propsOf('rules_click')).toEqual({ game: 'freecell' });
  });

  it('lets a guide page name the game it is about', () => {
    document.body.innerHTML =
      '<a href="/spades/" data-ch-track="related_game" data-ch-game="spades-rules" data-ch-to="spades">Play</a>';
    initLinkTracking();
    document.querySelector<HTMLElement>('a')!.click();
    expect(propsOf('related_game_click')).toEqual({
      from_game: 'spades-rules',
      to_game: 'spades',
    });
  });

  it('emits support_click carrying its placement', () => {
    document.body.innerHTML =
      '<a href="https://example.test" data-ch-track="support" data-ch-placement="postgame">Support</a>';
    initLinkTracking();
    document.querySelector<HTMLElement>('a')!.click();
    expect(propsOf('support_click')).toEqual({ placement: 'postgame' });
  });

  it('fires for a click on a child of the tracked element', () => {
    document.body.innerHTML =
      '<main data-game-id="hearts"><a href="/guides/hearts-rules/" data-ch-track="rules"><span>Rules</span></a></main>';
    initLinkTracking();
    document.querySelector<HTMLElement>('span')!.click();
    expect(count('rules_click')).toBe(1);
  });

  it('ignores untracked links and unknown track values', () => {
    document.body.innerHTML =
      '<a id="plain" href="/x/">x</a><a id="bogus" href="/y/" data-ch-track="nonsense">y</a>';
    initLinkTracking();
    document.getElementById('plain')!.click();
    document.getElementById('bogus')!.click();
    expect(names()).toEqual([]);
  });
});
