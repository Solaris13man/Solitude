import {
  loadDaily,
  isDailySolved,
  isDailyRequest,
  currentDailyStreak,
  totalDailySolves,
  dailyGame,
  utcDateKey,
} from './daily';

/**
 * A calm, on-site daily reminder. When you open the site (on any page except
 * the homepage — which already shows the Daily card — and the Daily page
 * itself) and today's Daily Challenge is still unsolved, a small dismissible
 * nudge slides in. It only appears for people who already play the Daily
 * (an active streak or past solves), and it remembers a dismissal for the
 * rest of the day, so it never nags.
 */
const DISMISS_KEY = 'cardhearth.daily.nudge.dismissed';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function initDailyReminder(): void {
  if (typeof document === 'undefined') return;

  const path = location.pathname.replace(/\/+$/, '');
  // The homepage shows the Daily card already; skip there and on the Daily page.
  if (path === '' || path === '/daily-challenge') return;
  if (isDailyRequest()) return; // already playing a daily/archive deal
  if (isDailySolved()) return;

  const today = utcDateKey();
  try {
    if (localStorage.getItem(DISMISS_KEY) === today) return;
  } catch {
    /* storage unavailable — just proceed */
  }

  const record = loadDaily();
  const streak = currentDailyStreak(record);
  // Stay calm: only remind people who actually engage with the Daily.
  if (streak === 0 && totalDailySolves(record) === 0) return;

  const game = dailyGame();
  const title = streak > 0 ? `🔥 Keep your ${streak}-day streak` : "📅 Today's Daily Challenge";

  const el = document.createElement('div');
  el.className = 'daily-nudge';
  el.setAttribute('role', 'status');
  el.innerHTML =
    `<div class="daily-nudge-body">` +
    `<span class="daily-nudge-title">${title}</span>` +
    `<span class="daily-nudge-sub">Today: ${esc(game.label)} — not done yet</span>` +
    `</div>` +
    `<a class="daily-nudge-play" href="/daily-challenge/">Play</a>` +
    `<button class="daily-nudge-close" type="button" aria-label="Dismiss reminder">&times;</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, today);
    } catch {
      /* ignore */
    }
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 300);
  };
  el.querySelector('.daily-nudge-close')?.addEventListener('click', dismiss);
  // Dismiss for the day once they head to the Daily.
  el.querySelector('.daily-nudge-play')?.addEventListener('click', () => {
    try {
      localStorage.setItem(DISMISS_KEY, today);
    } catch {
      /* ignore */
    }
  });
}
