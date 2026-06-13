import { SITE_CONFIG } from './site-config';

/**
 * Tiny analytics shim. With no provider configured (the default) every call
 * is a safe no-op, so the rest of the app can fire `track(...)` freely. When
 * a privacy-friendly provider is configured in site-config, this loads its
 * script and forwards events — no cookies, no personal data.
 */

let initialized = false;

export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const { provider, domain } = SITE_CONFIG.analytics;
  if (provider === 'plausible') {
    const s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-domain', domain);
    s.src = 'https://plausible.io/js/script.tagged-events.js';
    document.head.appendChild(s);
    // Plausible's queue shim so events fired before load aren't lost.
    const w = window as unknown as { plausible?: (...a: unknown[]) => void; };
    w.plausible =
      w.plausible ||
      function (...args: unknown[]) {
        ((w.plausible as unknown as { q: unknown[] }).q =
          (w.plausible as unknown as { q?: unknown[] }).q || []).push(args);
      };
  }
}

/** Record a product event. Safe to call anywhere; no-op until configured. */
export function track(event: string, props?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    if (SITE_CONFIG.analytics.provider === 'plausible') {
      const w = window as unknown as { plausible?: (e: string, o?: object) => void };
      w.plausible?.(event, props ? { props } : undefined);
    }
    // Always mirror to a debug buffer so events are inspectable in dev/tests.
    const w = window as unknown as { __chEvents?: unknown[] };
    (w.__chEvents = w.__chEvents || []).push({ event, props, t: Date.now() });
  } catch {
    // analytics must never break gameplay
  }
}
