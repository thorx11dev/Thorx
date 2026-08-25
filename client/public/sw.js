/* THORX service worker — deliberately conservative.
 *
 * Design rules (money platform — never serve stale money data):
 *   • /api/** and any non-GET request are NEVER intercepted — they pass
 *     straight to the network (sessions, CSRF cookies, earn events, surveys).
 *   • Hashed Vite bundles under /assets/ are immutable → cache-first.
 *     A new deploy ships new hashes, so stale caches can never shadow code.
 *   • Page navigations are network-first with a last-resort cache copy so a
 *     flaky mobile connection still opens the shell.
 *   • Bump CACHE_VERSION to invalidate everything on the next deploy.
 */
const CACHE_VERSION = "thorx-static-v2";
const STATIC_CACHE = `${CACHE_VERSION}-assets`;

self.addEventListener("install", (event) => {
  // No aggressive precache: the shell is cached on first navigation instead,
  // so installing the SW never blocks first paint.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== STATIC_CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Money traffic and mutations: always the network, no exceptions.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/ws")) return;

  // Immutable hashed bundles + public assets → cache-first.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (err) {
          return hit ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Navigations (HTML shell): network-first so deploys land instantly;
  // fall back to the last good copy only when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch (err) {
          const cache = await caches.open(STATIC_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          throw err;
        }
      })(),
    );
  }
});
