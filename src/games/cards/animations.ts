import type { GameState } from './types';
import type { Board } from './board';

/**
 * Deal animation: park every card on the stock, force a reflow, then let the
 * normal render glide them to their dealt positions with a small stagger.
 */
export function animateDeal(board: Board, state: GameState, enabled: boolean): void {
  if (!enabled) {
    board.render();
    return;
  }
  const m = board.metrics;
  board.render();
  const dealt = state.tableau.flat();
  dealt.forEach((card, i) => {
    const el = board.cardElement(card.id);
    if (!el) return;
    const final = el.style.transform;
    el.style.transition = 'none';
    el.style.transform = `translate3d(${m.stock.x}px, ${m.stock.y}px, 0)`;
    void el.offsetWidth;
    el.style.transition = '';
    el.style.transitionDelay = `${i * 22}ms`;
    el.style.transform = final;
    window.setTimeout(() => {
      el.style.transitionDelay = '';
    }, i * 22 + 400);
  });
}

/**
 * Win cascade: the classic bouncing-cards celebration. Cards launch one by
 * one from the foundations, bounce along the bottom of the board, and exit.
 * Runs entirely on requestAnimationFrame with direct transform writes.
 */
export function winCascade(board: Board, state: GameState, enabled: boolean, onDone: () => void): void {
  if (!enabled) {
    onDone();
    return;
  }
  const m = board.metrics;
  interface Flying {
    el: HTMLElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    done: boolean;
  }
  const queue: { el: HTMLElement; x: number; y: number }[] = [];
  // Peel foundations top-down, interleaving piles like the classic effect.
  for (let depth = 12; depth >= 0; depth--) {
    for (let f = 0; f < state.foundations.length; f++) {
      const card = state.foundations[f]![depth];
      if (!card) continue;
      const el = board.cardElement(card.id);
      if (!el) continue;
      const p = board.positionOf(card.id);
      queue.push({ el, x: p.x, y: p.y });
    }
  }
  const flying: Flying[] = [];
  const gravity = 0.0022 * m.cardH;
  let lastLaunch = 0;
  let lastTime = performance.now();
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    board.container.removeEventListener('pointerdown', stop);
    document.removeEventListener('keydown', stop);
    onDone();
  };
  board.container.addEventListener('pointerdown', stop);
  // Keyboard players shouldn't have to sit through the full cascade.
  document.addEventListener('keydown', stop);

  const tick = (now: number) => {
    if (stopped) return;
    const dt = Math.min(now - lastTime, 40);
    lastTime = now;
    // Big games (Spider's 104 cards) launch faster so the celebration
    // doesn't outstay its welcome.
    const cadence = queue.length + flying.length > 60 ? 55 : 110;
    if (queue.length > 0 && now - lastLaunch > cadence) {
      lastLaunch = now;
      const next = queue.shift()!;
      next.el.style.transition = 'none';
      next.el.style.zIndex = '2000';
      flying.push({
        el: next.el,
        x: next.x,
        y: next.y,
        vx: (Math.random() * 0.45 + 0.18) * (Math.random() < 0.5 ? -1 : 1) * (m.cardW / 40),
        vy: -Math.random() * 0.35 * (m.cardH / 56),
        done: false,
      });
    }
    let active = false;
    const floor = m.boardH - m.cardH;
    for (const f of flying) {
      if (f.done) continue;
      f.vy += gravity * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.y > floor) {
        f.y = floor;
        f.vy = -f.vy * 0.72;
      }
      if (f.x < -m.cardW * 1.5 || f.x > m.boardW + m.cardW * 0.5) {
        f.done = true;
        f.el.style.visibility = 'hidden';
        continue;
      }
      f.el.style.transform = `translate3d(${f.x}px, ${f.y}px, 0)`;
      active = true;
    }
    if (queue.length > 0 || active) {
      requestAnimationFrame(tick);
    } else {
      stop();
    }
  };
  requestAnimationFrame(tick);
}
