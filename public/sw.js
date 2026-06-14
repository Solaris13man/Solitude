/**
 * Minimal service worker for installability + fast repeat loads. Network-first
 * for navigations (so content stays fresh), cache-first for static assets.
 * Deliberately conservative: it never serves a stale HTML document while
 * online, so updates ship immediately.
 */
const CACHE = 'cardhearth-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/favicon.svg'])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (
            res.ok &&
            (url.pathname.startsWith('/_astro/') ||
              url.pathname.endsWith('.webp') ||
              url.pathname.endsWith('.png'))
          ) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// ---- Daily reminder push -------------------------------------------------
// Show one gentle notification when a daily reminder arrives — but skip it if
// the client already mirrored today's daily as solved (see push.ts).
self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();
  const title = payload.title || 'CardHearth Daily Challenge';
  const body = payload.body || "Today's Daily Challenge is ready — keep your streak going!";
  const url = payload.url || '/daily-challenge/';

  event.waitUntil(
    (async () => {
      // If today's daily is already solved, don't nag.
      try {
        const cache = await caches.open('cardhearth-daily');
        const res = await cache.match('/__daily_solved');
        if (res) {
          const solvedKey = (await res.text()).trim();
          if (solvedKey === new Date().toISOString().slice(0, 10)) return;
        }
      } catch {
        /* fall through and show it */
      }
      await self.registration.showNotification(title, {
        body,
        icon: '/logo.png',
        badge: '/favicon.svg',
        tag: 'cardhearth-daily',
        data: { url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/daily-challenge/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
