import { type Card, cardName } from './deck';

/**
 * Mark a hand card as an operable control for keyboard and screen-reader users,
 * matching the solitaire board idiom (focusable, `role="button"`, labelled).
 * The optional state enriches the label so non-visual players know whether the
 * card can be played right now or is currently selected.
 */
export function markHandCard(
  el: HTMLElement,
  card: Card,
  state?: { playable?: boolean; selected?: boolean },
): void {
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  let label = cardName(card);
  if (state?.selected) label += ', selected';
  else if (state?.playable === false) label += ', not playable';
  el.setAttribute('aria-label', label);
}

/**
 * Wire Enter/Space on a delegated container to the same action as a click, so
 * the trick-card games are fully playable without a pointer. `selector` matches
 * the activated descendant (e.g. `.hcard`); the handler receives that element.
 * Mirrors the existing delegated click listener rather than replacing it.
 */
export function activateOnKey(
  container: HTMLElement,
  selector: string,
  handler: (el: HTMLElement) => void,
): void {
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (!el) return;
    e.preventDefault();
    handler(el);
  });
}
