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

import { FRIENDS } from "@/lib/features";

const BUILD = process.env.NEXT_PUBLIC_BUILD ?? "dev";

/** Pages worth having before they are asked for, so a cold start never waits. */
const SHELL = ["/", "/attendance", "/timetable", "/cafeteria", "/tasks", ...(FRIENDS ? ["/circle"] : []), "/settings", "/onboarding"];

const source = `
const BUILD = ${JSON.stringify(BUILD)};
const CACHE = "dockin-" + BUILD;
const SHELL = ${JSON.stringify(SHELL)};

// Network with a deadline and one retry: a stalled connection must never leave
// the app waiting forever for a file (that was the stuck brown screen).
function fetchSoon(req, ms) {
  const once = () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    return fetch(req, { signal: ctl.signal }).finally(() => clearTimeout(t));
  };
  return once().catch(() => once());
}

// Install = download the WHOLE new version first: every shell page and every
// script/style those pages load. Only when all of it is safely cached does the
// new version take over. If anything fails (weak signal), this install fails
// and the previous version — complete, cached — keeps running; the browser
// tries the update again on the next open.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      const assets = new Set();
      for (const u of SHELL) {
        const res = await fetchSoon(new Request(u, { cache: "reload" }), 15000);
        if (!res.ok) throw new Error("shell " + u + " " + res.status);
        const html = await res.clone().text();
        await c.put(u, res);
        for (const part of html.split("/_next/static/").slice(1)) {
          const path = part.slice(0, part.search(/["'\\s)\\\\]/));
          if (/\\.(js|css)$/.test(path)) assets.add("/_next/static/" + path);
        }
      }
      for (const a of assets) {
        if (await c.match(a)) continue;
        const res = await fetchSoon(new Request(a, { cache: "reload" }), 20000);
        if (!res.ok) throw new Error("asset " + a + " " + res.status);
        await c.put(a, res);
      }
      await self.skipWaiting();
    })(),
  );
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
  // brought up to date behind it. When a page is not cached yet, a stalled
  // socket must never become a minute-long freeze: after a short wait, fall back
  // to the app shell, which boots and renders the right screen from the URL.
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
        if (hit) {
          fresh.catch(function () {});
          return hit;
        }
        const bail = new Promise((r) => setTimeout(r, 2500)).then(() => caches.match("/"));
        return Promise.race([fresh, bail]).then((r) => r || fresh);
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
          fetchSoon(req, 15000).then((res) => {
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
