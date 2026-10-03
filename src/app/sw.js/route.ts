/**
 * The service worker, served by the app rather than sitting in /public.
 *
 * It is here for one reason: the build stamp has to be *inside* the script. A
 * browser decides whether to install a new worker by comparing the bytes at the
 * same address, so a stamp in the query string only works while the page asking
 * for it is fresh — and the whole point of what follows is that the page is
 * usually served from the cache, where its stamp is last week's. Put the stamp
 * in the script and every deploy produces different bytes at /sw.js, the worker
 * updates on its own, and the old cache goes with it.
 */

const BUILD = process.env.NEXT_PUBLIC_BUILD ?? "dev";

/** Pages worth having before they are asked for, so a cold start never waits. */
const SHELL = ["/", "/attendance", "/money", "/tasks", "/circle", "/settings"];

const source = `
const BUILD = ${JSON.stringify(BUILD)};
const CACHE = "dockin-" + BUILD;
const SHELL = ${JSON.stringify(SHELL)};

self.addEventListener("install", (event) => {
  // Warm the shell so the first launch after an update is instant too. One
  // failed page must not fail the install, hence the per-URL catch.
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

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
  if (url.pathname.startsWith("/api/")) return;

  // Pages: answer from the cache at once and refresh in the background.
  //
  // This is the difference between an app and a website. Network-first meant
  // every single launch waited on the network, so a bad signal was a spinner
  // and no signal was a browser error page — on an app whose data is all on the
  // phone anyway. Now the screen is there immediately and the copy on disk is
  // brought up to date behind it.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit || caches.match("/"));
        return hit || fresh;
      }),
    );
    return;
  }

  // Static files: cache first. Their names carry a hash of their contents, so a
  // hit is always the right file.
  if (
    url.pathname.startsWith("/_next/static/") ||
    /\\.(png|svg|ico|woff2?|webmanifest)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
`;

export function GET() {
  return new Response(source, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Always re-checked, or a phone can never learn about a new worker.
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
