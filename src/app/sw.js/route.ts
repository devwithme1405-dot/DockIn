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

/** Shown only when there is no network and nothing cached yet; it reconnects on its own. */
const OFFLINE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6ecd9"><title>DockIn</title>
<style>html,body{margin:0;height:100%;background:#f6ecd9;color:#3b2414;font:16px/1.4 system-ui,-apple-system,Roboto,sans-serif}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;box-sizing:border-box}
.cap{width:84px;height:84px;border-radius:24px;background:linear-gradient(160deg,#c06a2b,#864220);display:grid;place-items:center;box-shadow:0 14px 30px -14px #864220;font-size:40px}
h1{font-size:22px;margin:22px 0 6px}p{margin:0;color:#7a5a43;font-size:14.5px;max-width:280px}
.dot{width:8px;height:8px;border-radius:50%;background:#c06a2b;display:inline-block;margin:0 3px;animation:b 1s infinite ease-in-out}.dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
@keyframes b{0%,80%,100%{transform:scale(.6);opacity:.5}40%{transform:scale(1);opacity:1}}
button{margin-top:26px;height:48px;padding:0 28px;border:0;border-radius:16px;background:linear-gradient(180deg,#a5562a,#7a3c1c);color:#fff;font-weight:700;font-size:15px}</style></head>
<body><main><div class="cap">🎓</div><h1>Can't reach DockIn</h1><p>Check your internet. DockIn will open by itself as soon as you're back online.</p>
<div style="margin-top:18px"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
<button onclick="location.reload()">Try again</button></main>
<script>function t(){fetch("/",{cache:"no-store"}).then(function(r){if(r.ok)location.reload()}).catch(function(){})}addEventListener("online",t);setInterval(t,4000)</script></body></html>`;

const source = `
const BUILD = ${JSON.stringify(BUILD)};
const CACHE = "dockin-" + BUILD;
const SHELL = ${JSON.stringify(SHELL)};
const OFFLINE = ${JSON.stringify(OFFLINE_PAGE)};

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

// Any cached screen boots the app, which then draws the right one from the URL.
async function anyShell() {
  for (const u of ["/", ...SHELL]) {
    const r = await caches.match(u, { ignoreSearch: true });
    if (r) return r;
  }
  return null;
}

// Nothing cached and no network: DockIn's own page, which retries by itself.
function offline() {
  return new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
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
      .then(() => self.clients.claim())
      .then(() => {
        precacheRest();
      }),
  );
});

// The rest of the app, for offline: every script, style and font of this build,
// including parts nobody has opened yet (a sheet, a tool) — so offline mode
// never meets a "this part couldn't load". Two sources: the list the build
// writes, and the references inside the files already saved (followed until
// there are no new ones). Best effort and in the background: a file missed here
// is simply fetched when first used, and the next start tries again.
let rest = null;
let restAt = 0;
function precacheRest() {
  if (rest) return rest;
  if (self.navigator && self.navigator.onLine === false) return null;
  if (Date.now() - restAt < 120000) return null;
  restAt = Date.now();
  rest = (async () => {
    const c = await caches.open(CACHE);
    const queue = [];
    try {
      const r = await fetchSoon(new Request("/_next/static/dockin-precache.json", { cache: "no-store" }), 10000);
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list)) for (const a of list) if (typeof a === "string" && a.indexOf("/_next/static/") === 0) queue.push(a);
      }
    } catch (e) {}
    for (const k of await c.keys()) {
      const p = new URL(k.url).pathname;
      if (p.indexOf("/_next/static/") === 0) queue.push(p);
    }
    const seen = new Set();
    let missed = 0;
    while (queue.length) {
      const p = queue.pop();
      if (seen.has(p)) continue;
      seen.add(p);
      let res = await c.match(p);
      if (!res) {
        try {
          res = await fetchSoon(new Request(p, { cache: "reload" }), 20000);
          if (!res.ok) continue;
          await c.put(p, res.clone());
        } catch (e) {
          missed++;
          continue;
        }
      }
      if (!/\\.(js|css)$/.test(p)) continue;
      let text = "";
      try {
        text = await res.text();
      } catch (e) {
        continue;
      }
      const refs = text.match(/static\\/(?:chunks|media|css)\\/[A-Za-z0-9_.~\\/-]+\\.(?:js|css|woff2?)/g) || [];
      for (const m of refs) {
        const q = "/_next/" + m;
        if (!seen.has(q)) queue.push(q);
      }
    }
    return missed;
  })()
    .catch(() => 1)
    .then((missed) => {
      // Anything missed (a weak moment): allowed to try again later.
      if (missed) rest = null;
    });
  return rest;
}

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
    precacheRest();
    event.respondWith(
      (async () => {
        const hit = (await caches.match(req, { ignoreSearch: true })) || (await caches.match(url.pathname));
        const fresh = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        });
        if (hit) {
          fresh.catch(function () {});
          return hit;
        }
        // Never answer with nothing: that is Android's "Web page not available".
        const first = await Promise.race([fresh.catch(() => null), new Promise((r) => setTimeout(() => r(null), 2500))]);
        if (first) return first;
        const shell = await anyShell();
        if (shell) return shell;
        const late = await fresh.catch(() => null);
        return late || offline();
      })(),
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
