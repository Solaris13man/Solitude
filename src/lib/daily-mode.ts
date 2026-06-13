import {
  type DailyEntry,
  bestDailyStreak,
  currentDailyStreak,
  dailyGame,
  dailyNumber,
  formatCountdown,
  isDailyRequest,
  loadDaily,
  msUntilNextDaily,
  recordDailyWin,
  totalDailySolves,
  utcDateKey,
} from './daily';
import { formatTime } from './stats';
import { track } from './analytics';

/**
 * Encapsulates Daily Challenge mode for any game's controller. A controller
 * makes one of these with its game id; when `active`, it supplies the day's
 * seed/variant, a `.daily` save slot, the on-page banner, the win record, and
 * the share text — so every game gets an identical daily experience without
 * duplicating the plumbing.
 */
export class DailyMode {
  readonly entry: DailyEntry;
  readonly active: boolean;
  readonly seed: number;
  readonly variant: number;

  constructor(gameId: string) {
    this.entry = dailyGame();
    this.active = isDailyRequest() && this.entry.game === gameId;
    this.seed = this.entry.game === gameId ? dailySeedNow() : 0;
    this.variant = this.entry.variant;
  }

  get saveSuffix(): string {
    return this.active ? '.daily' : '';
  }

  /** True if `stateSeed` is today's daily deal (guards stale saves). */
  isToday(stateSeed: number): boolean {
    return this.active && stateSeed === dailySeedNow();
  }

  /** Reveal and populate the banner host that GameShell always renders. */
  mountBanner(): void {
    const host = document.getElementById('daily-banner');
    if (!host) return;
    host.hidden = false;
    host.innerHTML =
      '<span id="daily-title" class="daily-banner-title"></span>' +
      '<span id="daily-status" class="daily-banner-status"></span>';
    this.refreshBanner();
  }

  refreshBanner(): void {
    if (!this.active) return;
    const titleEl = document.getElementById('daily-title');
    const statusEl = document.getElementById('daily-status');
    const now = new Date();
    if (titleEl) {
      const date = now.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'long',
        day: 'numeric',
      });
      titleEl.textContent = `Daily #${dailyNumber(now)} · ${this.entry.label} · ${date}`;
    }
    if (statusEl) {
      const record = loadDaily();
      const today = record.days[utcDateKey(now)];
      const countdown = formatCountdown(msUntilNextDaily(now));
      const streak = currentDailyStreak(record, now);
      statusEl.textContent = today
        ? `Solved in ${formatTime(today.timeMs)} ✓ · Streak ${streak} 🔥 · Next in ${countdown}`
        : `Today's challenge for everyone · Streak ${streak} · Next in ${countdown}`;
    }
  }

  /** Record a solve into the daily history; returns the current streak. */
  recordSolve(timeMs: number, moves: number, score: number, game: string): number {
    const record = recordDailyWin(utcDateKey(), { timeMs, moves, score, game });
    track('daily_solved', { game, seconds: Math.round(timeMs / 1000) });
    this.refreshBanner();
    return currentDailyStreak(record);
  }

  /** A challenge link to today's daily (everyone gets the same one). */
  shareText(solved: boolean, elapsedMs: number): { url: string; text: string } {
    const url = `${window.location.origin}/daily-challenge/`;
    const text = solved
      ? `CardHearth Daily #${dailyNumber()} (${this.entry.label}) solved in ${formatTime(elapsedMs)}. Same challenge for everyone — can you beat it?`
      : `Today's CardHearth Daily Challenge: ${this.entry.label}, the same for everyone. Can you solve it?`;
    return { url, text };
  }

  dealLabel(): string {
    return `Daily #${dailyNumber()}`;
  }

  /** A "Daily Challenge" section for the stats dialog (recent solves). */
  static statsRows(): string {
    const record = loadDaily();
    const recent = Object.entries(record.days)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 5);
    return [
      '<dt class="stats-section">Daily Challenge</dt><dd class="stats-section"></dd>',
      `<dt>Current streak</dt><dd>${currentDailyStreak(record)}</dd>`,
      `<dt>Best streak</dt><dd>${bestDailyStreak(record)}</dd>`,
      `<dt>Dailies solved</dt><dd>${totalDailySolves(record)}</dd>`,
      ...recent.map(
        ([day, r]) =>
          `<dt>${day}${r.game ? ` · ${r.game}` : ''}</dt><dd>${formatTime(r.timeMs)}</dd>`,
      ),
    ].join('');
  }
}

function dailySeedNow(): number {
  const date = new Date();
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}
