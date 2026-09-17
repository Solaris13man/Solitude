import {
  currentDailyStreak,
  dailyGame,
  isDailyRequest,
  isDailySolved,
  loadDaily,
} from './daily';

/**
 * Enhances the static Daily Challenge strip on game pages with today's actual
 * challenge and the player's streak.
 *
 * The server-rendered copy is already true and useful, so this only ever
 * sharpens it — if storage is unavailable or anything throws, the player still
 * sees a working link rather than an empty box.
 */
export function initDailyStrip(): void {
  if (typeof document === 'undefined') return;
  render();
  // recordResult() and recordDailyWin() both dispatch this, so solving today's
  // challenge updates the strip without a reload.
  window.addEventListener('cardhearth:result', render);
}

function render(): void {
  const strips = document.querySelectorAll<HTMLElement>('[data-daily-strip]');
  if (strips.length === 0) return;

  // Already playing the daily: the banner above the board says everything this
  // strip would, and a second pointer to the same thing is just noise.
  if (isDailyRequest()) {
    for (const strip of strips) strip.hidden = true;
    return;
  }

  try {
    const entry = dailyGame();
    const solved = isDailySolved();
    const streak = currentDailyStreak(loadDaily());

    const title = solved
      ? streak > 0
        ? `Daily Challenge · ${streak}-day streak 🔥`
        : 'Daily Challenge · done for today ✓'
      : `Today's Daily Challenge: ${entry.label}`;
    const status = solved
      ? 'Solved. Come back tomorrow to keep it going.'
      : streak > 0
        ? `Keep your ${streak}-day streak alive — the same puzzle for everyone.`
        : 'One puzzle a day, the same for everyone — build a streak.';
    const href = solved ? '/daily-challenge/' : `${entry.path}?daily=1`;

    for (const strip of strips) {
      strip.hidden = false;
      const titleEl = strip.querySelector<HTMLElement>('[data-daily-strip-title]');
      const statusEl = strip.querySelector<HTMLElement>('[data-daily-strip-status]');
      const link = strip.querySelector<HTMLAnchorElement>('[data-daily-strip-link]');
      if (titleEl) titleEl.textContent = title;
      if (statusEl) statusEl.textContent = status;
      if (link) {
        link.href = href;
        link.dataset.chPlacement = solved ? 'game_page_solved' : 'game_page';
      }
      strip.classList.toggle('daily-strip-solved', solved);
    }
  } catch {
    // Leave the server-rendered copy in place — it is already correct.
  }
}
