"use client";

import { useEffect, useRef } from "react";

/**
 * Back closes whatever is on top — a sheet, the scanner, an info page — the
 * way every phone app works, instead of leaving the tab underneath it.
 *
 * While anything is open, one "marker" history entry (same URL) sits on top.
 * The phone's Back pops it and we close the top layer. Closing from the UI
 * steps back over the marker so it never piles up. If something navigates
 * while a marker is on top, use {@link pushPastLayer} so the marker is reused
 * instead of being left behind.
 */

type Layer = { close: () => void; popped: boolean };
type Marked = { dockinSheet?: boolean; dockinFromToday?: boolean } | null;

const layers: Layer[] = [];
let listening = false;
let selfBack = false;
let pending = 0;

const isMarker = (s: unknown) => !!(s as Marked)?.dockinSheet;

function pushMarker() {
  const prev = window.history.state as Marked;
  window.history.pushState({ dockinFromToday: !!prev?.dockinFromToday, dockinSheet: true }, "", window.location.href);
}

function onPop() {
  if (selfBack) {
    // Our own step back over the marker. Something may have opened meanwhile.
    selfBack = false;
    if (layers.length && !isMarker(window.history.state)) pushMarker();
    return;
  }
  if (layers.length) {
    const top = layers.pop()!;
    top.popped = true;
    top.close();
    if (layers.length && !isMarker(window.history.state)) pushMarker();
    return;
  }
  // Landed on a marker nothing owns any more (left behind by a navigation): skip it.
  if (isMarker(window.history.state)) {
    selfBack = true;
    window.history.back();
  }
}

/** Ties `open` to the Back button: Back calls `onClose`. */
export function useBackClose(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!listening) {
      listening = true;
      window.addEventListener("popstate", onPop);
    }
    const layer: Layer = { close: () => close.current(), popped: false };
    layers.push(layer);
    pending++;
    if (!isMarker(window.history.state) && !selfBack) pushMarker();
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      if (layer.popped) return;
      // Wait for this commit's other effects: another layer may be opening in
      // its place (sheet → sheet). A microtask runs right after them, long
      // before anything else (like a navigation) could start.
      const ticket = ++pending;
      queueMicrotask(() => {
        if (ticket !== pending) return;
        if (layers.length === 0 && isMarker(window.history.state) && !selfBack) {
          selfBack = true;
          window.history.back();
        }
      });
    };
  }, [open]);
}

/**
 * pushState for screens opened from inside a layer (e.g. a chat opened right
 * after joining a group): replaces the marker instead of stacking on it.
 */
export function pushPastLayer(state: Record<string, unknown>, url: string) {
  pending++;
  if (isMarker(window.history.state)) {
    const prev = window.history.state as Marked;
    window.history.replaceState({ dockinFromToday: !!prev?.dockinFromToday, ...state }, "", url);
  } else {
    window.history.pushState(state, "", url);
  }
}

/**
 * Android's Back button, answered by the page itself (MainActivity asks this
 * first).
 *
 * Android's WebView, like Chrome, skips history entries a page added without
 * a fresh tap when it goes back on its own — so a chat opened from a profile,
 * or the "Send this file" sheet after the file picker, made Back jump past
 * Friends straight to Today. A `history.back()` from the page is never
 * skipped: it always lands on the screen right behind. Returns "web" when it
 * went back, "root" when there is nothing behind (the app steps aside), or
 * "native" when this WebView can't tell (the old way is used).
 */
export function installBackHandler(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __dockinBack?: () => string }).__dockinBack = () => {
    const nav = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation;
    if (!nav || typeof nav.canGoBack !== "boolean") return "native";
    if (!nav.canGoBack) return "root";
    window.history.back();
    return "web";
  };
}

