import {
  type DailyEntry,
  bestDailyStreak,
  currentDailyStreak,
  dailyGame,
  dailyNumber,
  dailySeed,
  formatCountdown,
  loadDaily,
  msUntilNextDaily,
  recordDailyWin,
  requestedDailyDate,
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
 * duplicating the plumbing. The day can be today (?daily=1) or an archived
 * date (?daily=YYYY-MM-DD); future/pre-launch dates never activate.
 */
export class DailyMode {
  readonly entry: DailyEntry;
  readonly active: boolean;
  readonly seed: number;
  readonly variant: number;
  /** The UTC date this daily is for (today or an archived day); null if off. */
  readonly date: Date | null;
  /** True when this is a past day's challenge rather than today's. */
  readonly isArchive: boolean;

  constructor(gameId: string) {
    this.date = requestedDailyDate();
    const refDate = this.date ?? new Date();
    this.entry = dailyGame(refDate);
    this.active = this.date !== null && this.entry.game === gameId;
    this.seed = this.active ? dailySeed(refDate) : 0;
    this.variant = this.entry.variant;
    this.isArchive = this.active && utcDateKey(refDate) !== utcDateKey(new Date());
  }

  get saveSuffix(): string {
    return this.active ? '.daily' : '';
  }

  /** True if `stateSeed` is this daily's deal (guards stale saves). */
  isToday(stateSeed: number): boolean {
    return this.active && stateSeed === this.seed;
  }

  /** Reveal and populate the banner host that GameShell always renders. */
  mountBanner(): void {
    const host = document.getElementById('daily-banner');
    if (!host) return;
    host.hidden = false;
    if (this.isArchive) host.classList.add('daily-banner-archive');
    host.innerHTML =
      '<span id="daily-title" class="daily-banner-title"></span>' +
      '<span id="daily-status" class="daily-banner-status"></span>';
    this.refreshBanner();
  }

  refreshBanner(): void {
    if (!this.active || !this.date) return;
    const titleEl = document.getElementById('daily-title');
    const statusEl = document.getElementById('daily-status');
    const dateLabel = this.date.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      year: this.isArchive ? 'numeric' : undefined,
      month: 'long',
      day: 'numeric',
    });
    if (titleEl) {
      const prefix = this.isArchive ? 'Archived Daily' : 'Daily';
      titleEl.textContent = `${prefix} #${dailyNumber(this.date)} · ${this.entry.label} · ${dateLabel}`;
    }
    if (statusEl) {
      const record = loadDaily();
      const solved = record.days[utcDateKey(this.date)];
      if (this.isArchive) {
        statusEl.textContent = solved
          ? `Solved in ${formatTime(solved.timeMs)} ✓ · Catching up on a missed day`
          : `A challenge you missed — solve it to fill in your calendar`;
      } else {
        const countdown = formatCountdown(msUntilNextDaily());
        const streak = currentDailyStreak(record);
        statusEl.textContent = solved
          ? `Solved in ${formatTime(solved.timeMs)} ✓ · Streak ${streak} 🔥 · Next in ${countdown}`
          : `Today's challenge for everyone · Streak ${streak} · Next in ${countdown}`;
      }
    }
  }

  /** Record a solve into the daily history; returns the current streak. */
  recordSolve(timeMs: number, moves: number, score: number, game: string): number {
    const dateKey = utcDateKey(this.date ?? new Date());
    const record = recordDailyWin(dateKey, { timeMs, moves, score, game });
    track('daily_solved', { game, seconds: Math.round(timeMs / 1000), archive: this.isArchive });
    this.refreshBanner();
    return currentDailyStreak(record);
  }

  /** A challenge link to this daily (everyone gets the same one). */
  shareText(solved: boolean, elapsedMs: number): { url: string; text: string } {
    const ref = this.date ?? new Date();
    const url = this.isArchive
      ? `${window.location.origin}${this.entry.path}?daily=${utcDateKey(ref)}`
      : `${window.location.origin}/daily-challenge/`;
    const num = dailyNumber(ref);
    if (!solved) {
      return {
        url,
        text: `CardHearth Daily Challenge #${num}: ${this.entry.label}, the same for everyone. Can you solve it?`,
      };
    }
    // A compact, "Wordle-style" brag: game, time, and the streak as social proof.
    const streak = currentDailyStreak(loadDaily());
    const streakLine = streak > 1 ? `\n🔥 ${streak}-day streak` : '';
    const text =
      `🃏 CardHearth Daily #${num} — ${this.entry.label}\n` +
      `⏱️ Solved in ${formatTime(elapsedMs)}${streakLine}\n` +
      `Same puzzle for everyone — beat my time:`;
    return { url, text };
  }

  dealLabel(): string {
    return `Daily #${dailyNumber(this.date ?? new Date())}`;
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
