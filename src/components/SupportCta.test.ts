// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { SITE_CONFIG } from '../lib/site-config';
import { initLinkTracking, resetLinkTracking } from '../lib/analytics';

/**
 * SupportCta is an .astro component, so what is asserted here is the contract
 * it depends on: the config default that keeps it invisible, and the tracking
 * behaviour of the markup it renders.
 */

interface Recorded {
  event: string;
  props?: Record<string, unknown>;
}
const events = () => (window as unknown as { __chEvents?: Recorded[] }).__chEvents ?? [];

beforeEach(() => {
  (window as unknown as { __chEvents?: Recorded[] }).__chEvents = [];
  document.body.innerHTML = '';
  resetLinkTracking();
});

describe('support configuration', () => {
  it('ships with no support URL, so the CTA renders nothing by default', () => {
    // If this ever fails, a support destination was committed. That is a
    // deliberate act (see docs/support-setup.md), not something to happen by
    // accident in a refactor.
    expect(SITE_CONFIG.support.url).toBe('');
  });

  it('has honest, non-urgent copy', () => {
    expect(SITE_CONFIG.support.label).toBeTruthy();
    expect(SITE_CONFIG.support.blurb).toBeTruthy();
    const copy = `${SITE_CONFIG.support.label} ${SITE_CONFIG.support.blurb}`.toLowerCase();
    for (const pressure of ['hurry', 'last chance', 'expires', 'only today', 'act now']) {
      expect(copy).not.toContain(pressure);
    }
  });

  it('is not a secret — the URL is public and shipped to the browser', () => {
    // Guards against someone pasting a key or a private link in here.
    expect(SITE_CONFIG.support.url).not.toMatch(/sk_|secret|token|api[-_]?key/i);
  });
});

describe('support link tracking', () => {
  it('reports support_click with the placement it was rendered at', () => {
    document.body.innerHTML = `
      <a class="support-cta-link" href="https://example.test/support"
         rel="noopener noreferrer" target="_blank"
         data-ch-track="support" data-ch-placement="postgame">Support CardHearth →</a>`;
    initLinkTracking();
    document.querySelector<HTMLElement>('a')!.click();
    const hit = events().find((e) => e.event === 'support_click');
    expect(hit?.props).toEqual({ placement: 'postgame' });
  });

  it('distinguishes the About placement from the post-game one', () => {
    document.body.innerHTML = `
      <a href="https://example.test/s" data-ch-track="support" data-ch-placement="about">Support</a>`;
    initLinkTracking();
    document.querySelector<HTMLElement>('a')!.click();
    expect(events().find((e) => e.event === 'support_click')?.props).toEqual({
      placement: 'about',
    });
  });
});
