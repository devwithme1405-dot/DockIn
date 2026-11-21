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
 *   (`/api/ping`). Two misses in a row: offline mode.
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
  /** How long one ping may take before it counts as a miss. */
  probe: 4500,
  /** Gap before the second ping that confirms a miss. */
  recheck: 1500,
  /** At most one check every this often while online. */
  gap: 20_000,
  /** How often to ask again while offline. */
  poll: 5000,
  /** A request still hanging after this long is a sign of a weak line. */
  slow: 10_000,
  /** An answer slower than this is a "weak network" moment. */
  weak: 2500,
  /** An answer faster than this counts towards "good enough to go online". */
  strong: 2000,
  /** This many weak moments… */
  weakCount: 3,
  /** …within this long suggests offline mode. */
  weakWindow: 3 * 60_000,
  /** After "Stay online", don't suggest again for this long. */
  snooze: 10 * 60_000,
  /** How long "Back online" shows. */
  backFor: 2600,
};

let rawFetch: typeof fetch | null = null;

/** One tiny request to DockIn's own server: did it answer, and how fast. */
export async function probe(): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, ms: 0 };
  const f = rawFetch ?? fetch;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMING.probe);
  try {
    const r = await f(`/api/ping?t=${Date.now()}`, { cache: "no-store", signal: ctl.signal });
    return { ok: r.ok, ms: Date.now() - t0 };
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Online: is the line actually usable?

let checking = false;
let lastCheck = 0;
let weakTimes: number[] = [];
let snoozedUntil = 0;

function weakMoment() {
  if (state.offline) return;
  const now = Date.now();
  weakTimes = [...weakTimes.filter((t) => now - t < TIMING.weakWindow), now];
  if (weakTimes.length >= TIMING.weakCount && now >= snoozedUntil && !state.weak) set({ weak: true });
}

/** Two misses → offline mode. A slow answer, or a miss then an answer → a weak moment. */
export async function check(force = false): Promise<void> {
  if (state.offline || checking) return;
  if (!force && Date.now() - lastCheck < TIMING.gap) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const first = await probe();
    if (first.ok) {
      if (first.ms > TIMING.weak) weakMoment();
      return;
    }
    await wait(TIMING.recheck);
    if (state.offline) return;
    const second = await probe();
    if (second.ok) {
      weakMoment();
      return;
    }
    goOffline();
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
        () => clearTimeout(slow),
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
  clearTimeout(backTimer);
  state = START;
  good = 0;
  checking = false;
  lastCheck = 0;
  weakTimes = [];
  snoozedUntil = 0;
}
