"use client";

import { goTab } from "./tabs";

/**
 * "Show my mess pass" from anywhere (the offline sheet, Today's offline card):
 * opens Cafeteria and brings the pass into view. The request is remembered
 * until Cafeteria is actually on screen to act on it.
 */
export const SHOW_PASS = "dockin:show-pass";

let pending = false;

export function showMessPass(): void {
  pending = true;
  if (window.location.pathname !== "/cafeteria") goTab("/cafeteria");
  window.setTimeout(() => window.dispatchEvent(new Event(SHOW_PASS)), 60);
}

/** Cafeteria: true once, if a "show the pass" request is waiting. */
export function takePassRequest(): boolean {
  const was = pending;
  pending = false;
  return was;
}

export function passRequested(): boolean {
  return pending;
}
