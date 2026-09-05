import {
  currentDailyStreak,
  dailyGame,
  isDailyRequest,
  isDailySolved,
  loadDaily,
} from './daily';
import { track } from './analytics';

/**
 * Fills every `[data-daily-cta]` slot — the game-over dialogs — with a pointer
 * back to today's Daily Challenge.
 *
 * Finishing a game is the highest-intent moment on the site, and it was the one
 * place the daily was never mentioned: the streak is the only mechanic that
 * gives a player a reason to come back tomorrow rather than just once.
 */
export function initDailyCta(): void {
  if (typeof document === 'undefined') return;
  render();
  // recordResult() and recordDailyWin() both dispatch this, so the streak stays
  // current across repeat wins without needing a reload.
  window.addEventListener('cardhearth:result', render);
}

function render(): void {
  const slots = document.querySelectorAll<HTMLElement>('[data-daily-cta]');
  if (slots.length === 0) return;

  // While playing the daily itself, the banner and daily-mode UI already cover
  // it — a second nudge in the same dialog would just be noise.
  if (isDailyRequest()) {
    for (const slot of slots) slot.hidden = true;
    return;
  }

  const entry = dailyGame();
  const solved = isDailySolved();
  const streak = currentDailyStreak(loadDaily());

  const text = solved
    ? streak > 0
      ? `Today's Daily Challenge is done — ${streak}-day streak. 🔥`
      : "Today's Daily Challenge is done. ✓"
    : streak > 0
      ? `Keep your ${streak}-day streak alive — today's challenge is ${entry.label}.`
      : `Today's Daily Challenge is ${entry.label} — the same deal for everyone.`;
  const href = solved ? '/daily-challenge/' : `${entry.path}?daily=1`;
  const label = solved ? 'See your streak →' : 'Play it →';

  for (const slot of slots) {
    // Rebuilt from scratch each time, so the click handler never stacks.
    slot.replaceChildren();
    slot.append(`${text} `);
    const link = document.createElement('a');
    link.href = href;
    link.className = 'underline';
    link.textContent = label;
    link.addEventListener('click', () => {
      track('daily_cta_clicked', { game: entry.game, solved });
    });
    slot.append(link);
    slot.hidden = false;
  }
}
