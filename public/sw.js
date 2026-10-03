// DockIn service worker: keeps the app opening instantly and offline.
// Data itself lives in IndexedDB, so only the app shell is cached here.
//
// The cache is named after the deploy that registered this worker
// (/sw.js?v=<build>), which is the whole trick: a new deploy registers a new
// worker, and the first thing it does on activating is throw away every older
// cache. Without that, a phone can serve yesterday's cached page alongside
// today's script names — the page draws and nothing responds, which looks to
// the person like the app is simply broken.
const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `dockin-${BUILD}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// The page asks for this after a script fails to load, so a phone that somehow
// still holds a broken mixture can clear itself without being reinstalled.
self.addEventListener("message", (event) => {
  if (event.data !== "dockin-reset") return;
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first, fall back to the last copy, then to the home page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/")),
        ),
    );
    return;
  }

  // Static files: cache first. Their names contain a hash of their contents, so
  // a hit is always the right file — and a miss means this deploy's copy, which
  // the cache above only ever holds alongside the page that asks for it.
  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|svg|ico|woff2?|webmanifest)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
