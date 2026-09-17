import { track } from './analytics';

/**
 * Per-page event bookkeeping for one game.
 *
 * Games call these methods instead of `track()` directly, so no controller
 * ever contains provider-specific code and the funnel keeps consistent
 * semantics across every game:
 *
 *   game_view      — once per page load (never repeats on rerender)
 *   game_start     — once per deal, on the player's FIRST real interaction
 *   game_complete  — once per deal, when the game actually finishes
 *   game_replay    — every time the player chooses to go again
 *
 * `deal()` resets the per-deal guards, so a session naturally emits one
 * start and one complete per deal no matter how often the UI re-renders.
 *
 * Nothing here collects personal data: no card states, no free text, and
 * `source_page` is only ever a same-origin pathname.
 */

/** Where a replay came from, so "new deal" and "same deal" stay separable. */
export type ReplayMode = 'new_deal' | 'same_deal' | 'next_round';

export interface CompleteInfo {
  /** Convenience for games whose only outcome is win/lose. */
  won?: boolean;
  /** Explicit outcome label; wins over `won` when both are given. */
  result?: string;
  /** Wall-clock length of the finished game. */
  durationSeconds?: number;
  /** Variant/difficulty index, when the game has variants. */
  variant?: number;
}

/** Same-origin referrer path only — never an external URL or a query string. */
function internalReferrerPath(): string | undefined {
  try {
    const ref = document.referrer;
    if (!ref) return undefined;
    const url = new URL(ref);
    if (url.origin !== window.location.origin) return undefined;
    if (url.pathname === window.location.pathname) return undefined;
    return url.pathname;
  } catch {
    return undefined;
  }
}

export class GameSession {
  readonly game: string;
  private viewed = false;
  private started = false;
  private completed = false;

  constructor(game: string) {
    this.game = game;
  }

  /** Fires `game_view` once, however many times it is called. */
  view(): void {
    if (this.viewed) return;
    this.viewed = true;
    const source = internalReferrerPath();
    track('game_view', source ? { game: this.game, source_page: source } : { game: this.game });
  }

  /**
   * A fresh deal/board is on the table. Arms the start/complete guards again
   * WITHOUT emitting anything — dealing is not starting, and a page load that
   * deals a board must not look like a player who began playing.
   */
  deal(): void {
    this.started = false;
    this.completed = false;
  }

  /** The player actually did something. Emits `game_start` once per deal. */
  markStarted(variant?: number): void {
    if (this.started) return;
    this.started = true;
    track('game_start', variant === undefined ? { game: this.game } : { game: this.game, variant });
  }

  /** The game finished. Emits `game_complete` once per deal. */
  complete(info: CompleteInfo = {}): void {
    if (this.completed) return;
    this.completed = true;
    // A game can finish without a recorded interaction (a resumed save, an
    // auto-finish). Backfill the start so game_complete never outnumbers
    // game_start and the completion ratio stays meaningful.
    this.markStarted(info.variant);
    const props: Record<string, string | number | boolean> = { game: this.game };
    const result = info.result ?? (info.won === undefined ? undefined : info.won ? 'won' : 'lost');
    if (result !== undefined) props.result = result;
    if (
      info.durationSeconds !== undefined &&
      Number.isFinite(info.durationSeconds) &&
      info.durationSeconds >= 0
    ) {
      props.duration_seconds = Math.round(info.durationSeconds);
    }
    if (info.variant !== undefined) props.variant = info.variant;
    track('game_complete', props);
  }

  /** The player chose to go again. Not guarded — each replay is real. */
  replay(mode: ReplayMode = 'new_deal'): void {
    track('game_replay', { game: this.game, mode });
  }
}

// The page's single session, keyed off the `data-game-id` the game shell
// renders. Memoised so the layout and the controller share one instance and
// `game_view` can never fire twice.
let cached: GameSession | null | undefined;

/** The session for the game on this page, or null on a non-game page. */
export function pageGameSession(): GameSession | null {
  if (cached !== undefined) return cached;
  const id =
    typeof document === 'undefined'
      ? null
      : (document.querySelector<HTMLElement>('[data-game-id]')?.dataset.gameId ?? null);
  cached = id ? new GameSession(id) : null;
  return cached;
}

/** Test seam — drops the memoised session. */
export function resetPageGameSession(): void {
  cached = undefined;
}
