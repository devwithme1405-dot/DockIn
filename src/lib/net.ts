"use client";

import { useSyncExternalStore } from "react";

/**
 * Offline mode — fully automatic, both ways.
 *
 * DockIn keeps everything on the phone, so with no internet (or internet so weak
 * it might as well be none) the app simply carries on in offline mode, and when
 * a good connection is back it switches itself online and refreshes everything.
 * Nobody has to tap anything, and there is never a "No internet / Try again" wall.
 *
 * How it decides:
 * - The phone says it is offline (`navigator.onLine === false`): offline at once.
 * - Whenever there is a reason to doubt the line — launch, coming back to the
 *   app, a request that hung — it asks DockIn's own server a tiny question
 *   (`/api/ping`). A slow answer, or one that times out, is NOT offline: that
 *   is campus Wi-Fi being campus Wi-Fi, and the app just keeps trying online.
 *   Offline mode only when there is truly no network: the connection itself
 *   fails (no route, no DNS) three times in a row, or nothing at all has come
 *   back for two whole minutes.
 * - An answer that comes, but slowly, is a "weak network" moment. Several of
 *   those within a few minutes and DockIn suggests switching to offline mode
 *   ("Low network detected multiple times").
 * - In offline mode it quietly asks every few seconds. A couple of quick answers
 *   in a row and it is back online: the strip flashes "Back online", data
 *   syncs, chats and friends refresh.
 */

export type NetState = {
  /** In offline mode. */
  offline: boolean;
  /** Offline because the person chose it after a "low network" prompt. */
  chosen: boolean;
  /** Just came back online: the strip shows "Back online" for a moment. */
  back: boolean;
  /** "Low network detected multiple times" — suggest offline mode. */
  weak: boolean;
};

const START: NetState = { offline: false, chosen: false, back: false, weak: false };
let state: NetState = START;
const listeners = new Set<() => void>();

function set(patch: Partial<NetState>) {
  const next = { ...state, ...patch };
  if (next.offline === state.offline && next.chosen === state.chosen && next.back === state.back && next.weak === state.weak) return;
  state = next;
  try {
    // Headers leave room for the strip while it shows (offline, or "back online").
    document.documentElement.classList.toggle("offline", state.offline || state.back);
  } catch {
    /* no document (tests) */
  }
  listeners.forEach((l) => l());
}

export const getNet = (): NetState => state;
export const isOffline = (): boolean => state.offline;
export function subscribeNet(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useNet(): NetState {
  return useSyncExternalStore(subscribeNet, getNet, () => START);
}

/** Sent when DockIn is back online: time to sync and refresh everything. */
export const BACK_ONLINE = "dockin:back-online";

export const TIMING = {
  /** How long one ping may take before it counts as a miss (slow Wi-Fi still answers in time). */
  probe: 8000,
  /** Gap before each ping that confirms a miss. */
  recheck: 2500,
  /** Hard failures in a row that mean offline. */
  misses: 3,
  /** Nothing at all answering for this long also means offline (a dead line that only times out). */
  dead: 120_000,
  /** Any answer from the network this recent means the line works. */
  alive: 15_000,
  /** After coming back online, don't go offline again by itself this soon. */
  calm: 45_000,
  /** At most one check every this often while online. */
  gap: 20_000,
  /** How often to ask again while offline. */
  poll: 5000,
  /** A request still hanging after this long is a sign of a weak line. */
  slow: 15_000,
  /** An answer slower than this is a "weak network" moment. */
  weak: 7000,
  /** An answer faster than this counts towards "good enough to go online". */
  strong: 4000,
  /** This many weak moments… */
  weakCount: 4,
  /** …within this long suggests offline mode (only ever a suggestion). */
  weakWindow: 5 * 60_000,
  /** After "Stay online", don't suggest again for this long. */
  snooze: 45 * 60_000,
  /** How long "Back online" shows. */
  backFor: 2600,
};

let rawFetch: typeof fetch | null = null;

/**
 * One tiny request to DockIn's own server: did it answer, how fast, and if
 * not, how it failed — "timeout" (a weak line, still there) or "error" (the
 * connection itself failed: no network at all).
 */
export async function probe(): Promise<{ ok: boolean; ms: number; fail?: "timeout" | "error" }> {
  const t0 = Date.now();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, ms: 0, fail: "error" };
  const f = rawFetch ?? fetch;
  const ctl = new AbortController();
  let timedOut = false;
  const t = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, TIMING.probe);
  try {
    const r = await f(`/api/ping?t=${Date.now()}`, { cache: "no-store", signal: ctl.signal });
    // Any reply at all means the network is there.
    lastAnswer = Date.now();
    return r.ok ? { ok: true, ms: Date.now() - t0 } : { ok: false, ms: Date.now() - t0, fail: "timeout" };
  } catch {
    return { ok: false, ms: Date.now() - t0, fail: timedOut ? "timeout" : "error" };
  } finally {
    clearTimeout(t);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Online: is the line actually usable?

let checking = false;
let lastCheck = 0;
/** When the network last answered anything (any request, not only pings). */
let lastAnswer = 0;
let calmUntil = 0;

/** The fetch watcher: something came back, so the line works right now. */
export function answered(): void {
  lastAnswer = Date.now();
}
let weakTimes: number[] = [];
let snoozedUntil = 0;

function weakMoment() {
  if (state.offline) return;
  const now = Date.now();
  weakTimes = [...weakTimes.filter((t) => now - t < TIMING.weakWindow), now];
  if (weakTimes.length >= TIMING.weakCount && now >= snoozedUntil && !state.weak) set({ weak: true });
}

/** Since when nothing has answered (0 = something answered since the last check). */
let silentSince = 0;
/** While nothing answers, keep looking now and then (the app may be sitting idle). */
let recheckTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Offline mode only for a truly dead network: the connection fails outright
 * three times in a row, or nothing has answered for two minutes. Timeouts and
 * slow answers are a weak line — online, with at most a "weak" note.
 */
export async function check(force = false): Promise<void> {
  if (state.offline || checking) return;
  if (!force && Date.now() - lastCheck < TIMING.gap) return;
  checking = true;
  lastCheck = Date.now();
  try {
    let hardFails = 0;
    for (let i = 0; i < TIMING.misses; i++) {
      if (i > 0) await wait(TIMING.recheck);
      if (state.offline) return;
      const r = await probe();
      if (r.ok) {
        silentSince = 0;
        clearTimeout(recheckTimer);
        if (i > 0 || r.ms > TIMING.weak) weakMoment();
        return;
      }
      if (r.fail === "error") hardFails += 1;
    }
    const phoneSaysOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    const stillAnswering = Date.now() - lastAnswer < TIMING.alive;
    const justBack = Date.now() < calmUntil;
    if (!silentSince) silentSince = Date.now();
    const longSilence = Date.now() - silentSince >= TIMING.dead;
    const noNetwork = phoneSaysOffline || hardFails >= TIMING.misses || longSilence;
    if (noNetwork && !stillAnswering && !justBack) goOffline();
    else {
      weakMoment();
      // Nothing came back: look again in a while, so two silent minutes are noticed
      // even with nobody tapping anything. Not while the app is in the background.
      clearTimeout(recheckTimer);
      if (!stillAnswering)
        recheckTimer = setTimeout(() => {
          if (typeof document === "undefined" || document.visibilityState !== "hidden") void check(true);
        }, TIMING.gap);
    }
  } finally {
    checking = false;
  }
}

// ---------------------------------------------------------------------------
// Offline: has a good connection come back?

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let backTimer: ReturnType<typeof setTimeout> | undefined;
let good = 0;

function schedulePoll(ms = TIMING.poll) {
  clearTimeout(pollTimer);
  if (state.offline) pollTimer = setTimeout(() => void poll(), ms);
}

export async function poll(): Promise<void> {
  clearTimeout(pollTimer);
  if (!state.offline) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return; // resumes on return
  const r = await probe();
  if (!state.offline) return;
  const strong = r.ok && r.ms < TIMING.strong;
  good = strong ? good + 1 : 0;
  // Chosen offline because the line kept dropping: wait for it to be clearly good.
  if (good >= (state.chosen ? 3 : 2)) {
    backOnline();
    return;
  }
  schedulePoll(strong ? 2000 : TIMING.poll);
}

export function goOffline(chosen = false): void {
  if (state.offline) return;
  good = 0;
  clearTimeout(backTimer);
  set({ offline: true, chosen, back: false, weak: false });
  schedulePoll();
}

/** Back online by itself: show it for a moment, then refresh everything. */
function backOnline(): void {
  clearTimeout(pollTimer);
  good = 0;
  lastCheck = Date.now();
  calmUntil = Date.now() + TIMING.calm;
  silentSince = 0;
  weakTimes = [];
  set({ offline: false, chosen: false, back: true, weak: false });
  clearTimeout(backTimer);
  backTimer = setTimeout(() => set({ back: false }), TIMING.backFor);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BACK_ONLINE));
    // The sync engine and chat already catch up on the browser's own "online".
    window.dispatchEvent(new Event("online"));
  }
}

/** "Check now" in the offline sheet. */
export function retryNow(): void {
  if (state.offline) void poll();
}

/** The "low network" prompt: switch to offline mode. */
export function acceptWeak(): void {
  weakTimes = [];
  goOffline(true);
}

/** The "low network" prompt: stay online (and don't ask again for a while). */
export function dismissWeak(): void {
  weakTimes = [];
  snoozedUntil = Date.now() + TIMING.snooze;
  set({ weak: false });
}

/** Something hinted the line is bad (a request that failed or hung). */
export function trouble(): void {
  if (!state.offline) void check();
}

/** Requests that must cross the network: other servers, and DockIn's /api (never cached). */
function overTheNetwork(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw, window.location.href);
    return u.origin !== window.location.origin || u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

let started = false;

/** Starts watching the network. Safe to call more than once. */
export function startNet(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // Watch the app's own requests for trouble, without changing what they do.
  try {
    const original = window.fetch.bind(window);
    rawFetch = original;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const p = original(input, init);
      const slow = setTimeout(trouble, TIMING.slow);
      p.then(
        () => {
          clearTimeout(slow);
          // Only a real trip over the network counts (the service worker answers
          // the app's own files from the phone, network or not).
          if (overTheNetwork(input)) answered();
        },
        (e: unknown) => {
          clearTimeout(slow);
          if (!(e instanceof DOMException && e.name === "AbortError")) trouble();
        },
      );
      return p;
    }) as typeof fetch;
  } catch {
    /* fetch can't be wrapped: the other signals still work */
  }

  window.addEventListener("offline", () => goOffline());
  window.addEventListener("online", () => {
    if (state.offline) void poll();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (state.offline) void poll();
    else void check();
  });
  const conn = (navigator as Navigator & { connection?: EventTarget & { effectiveType?: string } }).connection;
  conn?.addEventListener?.("change", () => {
    if (state.offline) void poll();
    else if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") void check(true);
  });

  if (navigator.onLine === false) goOffline();
  else setTimeout(() => void check(true), 2500);
}

/** Tests only: back to a fresh start. */
export function resetNet(): void {
  clearTimeout(pollTimer);
  clearTimeout(recheckTimer);
  clearTimeout(backTimer);
  state = START;
  good = 0;
  checking = false;
  lastCheck = 0;
  lastAnswer = 0;
  calmUntil = 0;
  silentSince = 0;
  weakTimes = [];
  snoozedUntil = 0;
}
