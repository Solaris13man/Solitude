/**
 * First-party proxy for self-hosted Plausible analytics, host canonicalisation,
 * and static assets.
 *
 * Ad blockers filter obvious analytics hostnames, so the page loads the
 * script from THIS domain (/js/script.js) and posts events to /api/event;
 * this worker forwards both to the Plausible instance. Every other request
 * falls through to the static Astro build via the ASSETS binding.
 */
const STATS_HOST = 'https://stats.einherjarventures.com';

/**
 * The one host this site is indexed under. Everything in the repo already
 * agrees on it — astro.config.mjs `site`, every canonical tag, the sitemap,
 * robots.txt and all absolute internal links — so this is a statement of
 * existing intent, not a new choice.
 */
export const CANONICAL_HOST = 'cardhearth.com';

/**
 * Hosts that must never be redirected: local development and Cloudflare's
 * own preview deployments, which legitimately serve the site under their
 * own names and are kept out of the index by other means.
 */
function isExemptHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.workers.dev') ||
    hostname.endsWith('.pages.dev')
  );
}

/**
 * The visitor's real scheme. Behind Cloudflare the worker can be reached over
 * plain HTTP even though the edge speaks TLS upstream, so trust `cf-visitor`
 * first and fall back to the request URL.
 */
function visitorScheme(request, url) {
  const cfVisitor = request.headers.get('cf-visitor');
  if (cfVisitor) {
    try {
      const scheme = JSON.parse(cfVisitor).scheme;
      if (scheme === 'http' || scheme === 'https') return scheme;
    } catch {
      // malformed header — fall through to the URL
    }
  }
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded === 'http' || forwarded === 'https') return forwarded;
  return url.protocol === 'http:' ? 'http' : 'https';
}

/**
 * A permanent redirect to the canonical origin, or null when the request is
 * already canonical (or exempt).
 *
 * Both `www.cardhearth.com` and `http://cardhearth.com` were serving 200s
 * alongside the canonical `https://cardhearth.com`, which is exactly the
 * duplication Search Console was reporting. `www` was already handled at the
 * edge; plain HTTP was not, so the whole site existed twice.
 *
 * GET/HEAD only. A 301 on a POST invites clients to re-issue it as a GET,
 * which would silently drop Plausible events that arrive on the wrong host.
 */
export function canonicalRedirect(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  if (isExemptHost(url.hostname)) return null;
  const scheme = visitorScheme(request, url);
  if (url.hostname === CANONICAL_HOST && scheme === 'https') return null;

  const target = new URL(url);
  target.protocol = 'https:';
  target.hostname = CANONICAL_HOST;
  target.port = '';
  return Response.redirect(target.toString(), 301);
}

export default {
  async fetch(request, env) {
    const redirect = canonicalRedirect(request);
    if (redirect) return redirect;

    const url = new URL(request.url);

    if (url.pathname === '/js/script.js') {
      // Cache the (tiny, rarely-changing) script at the edge for 6h.
      return fetch(`${STATS_HOST}/js/script.js`, {
        cf: { cacheTtl: 21600, cacheEverything: true },
      });
    }

    if (url.pathname === '/api/event') {
      // Forward the original request (method, body, UA) and pass the real
      // client IP through so Plausible's unique-visitor hashing still works.
      const upstream = new Request(`${STATS_HOST}/api/event`, request);
      const ip = request.headers.get('cf-connecting-ip');
      if (ip) upstream.headers.set('X-Forwarded-For', ip);
      return fetch(upstream);
    }

    return env.ASSETS.fetch(request);
  },
};
