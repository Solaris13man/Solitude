import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANONICAL_HOST, canonicalRedirect } from './index.js';

/** A request as Cloudflare presents it, with the visitor's real scheme. */
function req(url, { method = 'GET', scheme, headers = {} } = {}) {
  const h = { ...headers };
  if (scheme) h['cf-visitor'] = JSON.stringify({ scheme });
  return new Request(url, { method, headers: h });
}

const location = (res) => (res ? res.headers.get('location') : null);

describe('canonicalRedirect', () => {
  it('leaves the canonical origin alone', () => {
    expect(canonicalRedirect(req('https://cardhearth.com/freecell/', { scheme: 'https' }))).toBeNull();
  });

  it('redirects www to the apex', () => {
    const res = canonicalRedirect(req('https://www.cardhearth.com/freecell/', { scheme: 'https' }));
    expect(res.status).toBe(301);
    expect(location(res)).toBe('https://cardhearth.com/freecell/');
  });

  it('redirects plain HTTP to HTTPS on the apex', () => {
    // The real duplication: http://cardhearth.com/* was serving 200s.
    const res = canonicalRedirect(req('http://cardhearth.com/freecell/', { scheme: 'http' }));
    expect(res.status).toBe(301);
    expect(location(res)).toBe('https://cardhearth.com/freecell/');
  });

  it('trusts cf-visitor over the request URL', () => {
    // Cloudflare speaks HTTPS to the worker even when the visitor used HTTP.
    const res = canonicalRedirect(req('https://cardhearth.com/spades/', { scheme: 'http' }));
    expect(res.status).toBe(301);
    expect(location(res)).toBe('https://cardhearth.com/spades/');
  });

  it('falls back to x-forwarded-proto when cf-visitor is absent', () => {
    const res = canonicalRedirect(
      req('https://cardhearth.com/hearts/', { headers: { 'x-forwarded-proto': 'http' } }),
    );
    expect(location(res)).toBe('https://cardhearth.com/hearts/');
  });

  it('ignores a malformed cf-visitor header rather than throwing', () => {
    const res = canonicalRedirect(
      req('https://www.cardhearth.com/', { headers: { 'cf-visitor': 'not json' } }),
    );
    expect(location(res)).toBe('https://cardhearth.com/');
  });

  it('preserves the path and the query string', () => {
    const res = canonicalRedirect(
      req('https://www.cardhearth.com/freecell/?deal=1234&mode=0', { scheme: 'https' }),
    );
    expect(location(res)).toBe('https://cardhearth.com/freecell/?deal=1234&mode=0');
  });

  it('redirects HEAD as well as GET', () => {
    const res = canonicalRedirect(
      req('https://www.cardhearth.com/', { method: 'HEAD', scheme: 'https' }),
    );
    expect(res.status).toBe(301);
  });

  it('never redirects a POST — that would drop Plausible events', () => {
    expect(
      canonicalRedirect(req('https://www.cardhearth.com/api/event', { method: 'POST', scheme: 'https' })),
    ).toBeNull();
  });

  it('leaves local development and preview deployments alone', () => {
    for (const host of [
      'http://localhost:4321/freecell/',
      'http://127.0.0.1:8788/',
      'https://cardhearth.pages.dev/spades/',
      'https://cardhearth.workers.dev/',
    ]) {
      expect(canonicalRedirect(req(host, { scheme: 'http' }))).toBeNull();
    }
  });

  it('agrees with the host the rest of the site canonicalises to', () => {
    // The worker's redirect target and Astro's `site` (which drives every
    // canonical tag, the sitemap and all absolute URLs) must never drift
    // apart — that would point the redirect at one host and the canonical
    // tags at another, which is worse than doing nothing at all.
    const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf-8');
    const site = /site:\s*'([^']+)'/.exec(config)?.[1];
    expect(site).toBeDefined();
    expect(new URL(site).hostname).toBe(CANONICAL_HOST);
    expect(new URL(site).protocol).toBe('https:');
  });

  it('matches the host robots.txt points the sitemap at', () => {
    const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf-8');
    const sitemap = /Sitemap:\s*(\S+)/.exec(robots)?.[1];
    expect(sitemap).toBeDefined();
    expect(new URL(sitemap).hostname).toBe(CANONICAL_HOST);
  });
});
