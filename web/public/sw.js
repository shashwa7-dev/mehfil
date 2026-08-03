/**
 * Minimal service worker.
 *
 * Two jobs: make the app installable (Chromium withholds
 * `beforeinstallprompt` unless a worker with a fetch handler is registered),
 * and keep it usable offline — without ever pinning a user to an old build.
 *
 * The caching split is the important part:
 *
 *   /_next/static/*  cache-first. Fingerprinted by the build, so a given URL
 *                    can never point at different bytes. Safe to keep forever.
 *
 *   everything else  network-first, cache only as an offline fallback. The
 *                    catalogue, portraits and icons all live at stable URLs
 *                    that change contents between deploys, so caching them
 *                    first would strand installed users on a stale catalogue
 *                    with no way to recover.
 *
 * The cache is also wiped on activation, so a new worker never inherits
 * entries written by an older one.
 */

const CACHE = "mehfil";
const IMMUTABLE = /^\/_next\/static\//;

self.addEventListener("install", () => {
  // Don't wait for every existing tab to close before taking over.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intervene in YouTube or Wikimedia requests.
  if (url.origin !== self.location.origin) return;

  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Network first: the network's answer always wins when it is reachable, so
  // a deploy is picked up on the next load rather than whenever a cache
  // happens to expire.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit ?? (request.mode === "navigate" ? caches.match("/") : undefined))
          .then((hit) => hit ?? Response.error())
      )
  );
});
