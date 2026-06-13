import { SITE_CONFIG } from './site-config';

/**
 * Ad helpers. The AdSense loader is added once in the document head (see
 * Layout). This module handles the optional, policy-conscious refresh: when
 * a game finishes — a genuine user-driven content change — we can request a
 * fresh ad. AdSense forbids timed/automatic refresh, so this is gated behind
 * `ads.refreshOnGameEnd` and fires at most once per finished game.
 */

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** Recreate each AdSense unit so AdSense serves a new ad into it. */
export function refreshAds(): void {
  if (typeof window === 'undefined') return;
  if (!SITE_CONFIG.ads.enabled || !SITE_CONFIG.ads.adsenseClient) return;
  const units = document.querySelectorAll<HTMLElement>('ins.adsbygoogle');
  for (const oldIns of units) {
    const fresh = oldIns.cloneNode(false) as HTMLElement;
    fresh.removeAttribute('data-adsbygoogle-status');
    fresh.removeAttribute('data-ad-status');
    fresh.style.display = 'block';
    oldIns.replaceWith(fresh);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // never let an ad failure affect gameplay
    }
  }
}

/** Wire refresh to the shared end-of-game signal, when enabled. */
export function initAdRefresh(): void {
  if (typeof window === 'undefined') return;
  if (!SITE_CONFIG.ads.enabled || !SITE_CONFIG.ads.refreshOnGameEnd) return;
  let last = 0;
  window.addEventListener('cardhearth:result', () => {
    // A light floor between refreshes as extra insurance against rapid-fire.
    const now = Date.now();
    if (now - last < 30_000) return;
    last = now;
    refreshAds();
  });
}
