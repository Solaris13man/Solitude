/**
 * First-party proxy for self-hosted Plausible analytics, plus static assets.
 *
 * Ad blockers filter obvious analytics hostnames, so the page loads the
 * script from THIS domain (/js/script.js) and posts events to /api/event;
 * this worker forwards both to the Plausible instance. Every other request
 * falls through to the static Astro build via the ASSETS binding.
 */
const STATS_HOST = 'https://stats.einherjarventures.com';

export default {
  async fetch(request, env) {
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
