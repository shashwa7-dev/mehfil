/**
 * Minimal service worker.
 *
 * Its main job is to make the app installable: Chromium will not fire
 * `beforeinstallprompt` — and so will not offer a native install — unless a
 * service worker with a fetch handler is registered.
 *
 * Caching is deliberately conservative. Navigations go to the network first so
 * a deploy is never masked by a stale shell; only fingerprinted build assets
 * and the catalogue are served cache-first. A wrongly aggressive worker is far
 * worse than none, because it strands users on an old build.
 */

const CACHE = "mehfil-v1";

// Same-origin paths worth keeping offline once fetched.
const CACHEABLE = [/^\/_next\/static\//, /^\/artists\//, /^\/catalogue\.json$/, /^\/logo\.png$/];

self.addEventListener("install", () => {
  // Take over as soon as possible rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch YouTube or Commons

  // Navigations: network first, cached shell only as an offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((r) => r ?? Response.error()))
    );
    return;
  }

  if (!CACHEABLE.some((re) => re.test(url.pathname))) return;

  // Build assets are fingerprinted and the catalogue only changes on deploy,
  // so serving these from cache cannot show stale content within a build.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      });
    })
  );
});
