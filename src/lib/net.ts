"use client";

import { useSyncExternalStore } from "react";

/**
 * Offline mode.
 *
 * DockIn keeps everything on the phone, so with no internet (or internet so weak
 * it might as well be none) the app should simply carry on — clearly saying it
 * is offline, never showing a "No internet / Try again" wall.
 *
 * How it decides:
 * - The phone says it is offline (`navigator.onLine === false`): offline at once.
 * - Otherwise, whenever there is a reason to doubt the line — at launch, on
 *   coming back to the app, a request that failed or hung — it asks DockIn's own
 *   server a tiny question (`/api/ping`). Two misses in a row, each allowed a
 *   few seconds, means the network is too weak to use: offline mode.
 * - In offline mode it keeps asking quietly every few seconds. Two good answers
 *   in a row and the "Network is back" popup comes up; the person chooses when
 *   to go online. (Data never waits for that tap: the sync engine retries on
 *   its own the moment the line works.)
 */

export type NetState = {
  /** In offline mode. */
  offline: boolean;
  /** In offline mode, but the network works again. */
  back: boolean;
  /** The "Network is back" popup is showing. */
  popup: boolean;
};

const START: NetState = { offline: false, back: false, popup: false };
let state: NetState = START;
const listeners = new Set<() => void>();

function set(patch: Partial<NetState>) {
  const next = { ...state, ...patch };
  if (next.offline === state.offline && next.back === state.back && next.popup === state.popup) return;
  state = next;
  try {
    document.documentElement.classList.toggle("offline", state.offline);
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

/** Sent when the person taps "Go online": time to sync and refresh everything. */
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
};

let rawFetch: typeof fetch | null = null;

/** One tiny request to DockIn's own server: true if it answered in time. */
export async function probe(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const f = rawFetch ?? fetch;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMING.probe);
  try {
    const r = await f(`/api/ping?t=${Date.now()}`, { cache: "no-store", signal: ctl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let checking = false;
let lastCheck = 0;

/** While online: is the line actually usable? Two misses → offline mode. */
export async function check(force = false): Promise<void> {
  if (state.offline || checking) return;
  if (!force && Date.now() - lastCheck < TIMING.gap) return;
  checking = true;
  lastCheck = Date.now();
  try {
    if (await probe()) return;
    await wait(TIMING.recheck);
    if (state.offline) return;
    if (await probe()) return;
    goOffline();
  } finally {
    checking = false;
  }
}

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let good = 0;

function schedulePoll(ms = TIMING.poll) {
  clearTimeout(pollTimer);
  if (state.offline) pollTimer = setTimeout(() => void poll(), ms);
}

/** While offline: has the network come back? */
export async function poll(): Promise<void> {
  clearTimeout(pollTimer);
  if (!state.offline) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return; // resumes on return
  const ok = await probe();
  if (!state.offline) return;
  if (ok) {
    good += 1;
    if (good >= 2 && !state.back) set({ back: true, popup: true });
  } else {
    good = 0;
    if (state.back) set({ back: false, popup: false });
  }
  schedulePoll(ok && good < 2 ? 2000 : TIMING.poll);
}

export function goOffline(): void {
  if (state.offline) return;
  good = 0;
  set({ offline: true, back: false, popup: false });
  schedulePoll();
}

/** The person chose to go online (the popup, or the banner once it is back). */
export function goOnline(): void {
  clearTimeout(pollTimer);
  good = 0;
  lastCheck = Date.now();
  set({ offline: false, back: false, popup: false });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BACK_ONLINE));
    // The sync engine and chat already catch up on the browser's own "online".
    window.dispatchEvent(new Event("online"));
  }
}

export function dismissPopup(): void {
  set({ popup: false });
}

/** Something hinted the line is bad (a failed or hanging request). */
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

  window.addEventListener("offline", goOffline);
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
    if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") void check(true);
  });

  if (navigator.onLine === false) goOffline();
  else setTimeout(() => void check(true), 2500);
}

/** Tests only: back to a fresh start. */
export function resetNet(): void {
  clearTimeout(pollTimer);
  state = START;
  good = 0;
  checking = false;
  lastCheck = 0;
}
