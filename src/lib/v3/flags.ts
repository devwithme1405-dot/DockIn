"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DockIn, isNativeApp } from "../native";

/**
 * DockIn 3 (assistant, outpass) is a test build for now. Its screens ship with
 * everyone's app but stay hidden unless this phone runs the preview APK (the
 * one shared by link). The answer is remembered so the next launch shows the
 * floating button at once, with no flicker.
 *
 * On the web, `localStorage["dockin-v3"] = "1"` turns it on (for testing).
 */
const KEY = "dockin-channel";
const listeners = new Set<() => void>();
let asked = false;

function read(): boolean {
  try {
    return localStorage.getItem("dockin-v3") === "1" || localStorage.getItem(KEY) === "preview";
  } catch {
    return false;
  }
}

function ask() {
  if (asked || !isNativeApp()) return;
  asked = true;
  DockIn.channel()
    .then(({ channel }) => {
      try {
        if (channel === "preview") localStorage.setItem(KEY, "preview");
        else localStorage.removeItem(KEY);
      } catch {
        /* private mode */
      }
      listeners.forEach((f) => f());
    })
    .catch(() => {
      // A build from before DockIn 3: never preview.
      try {
        localStorage.removeItem(KEY);
      } catch {}
      listeners.forEach((f) => f());
    });
}

function subscribe(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** True on the DockIn 3 preview APK (or with the web test switch on). */
export function usePreview(): boolean {
  const on = useSyncExternalStore(subscribe, read, () => false);
  useEffect(ask, []);
  return on;
}

export function isPreview(): boolean {
  return typeof window !== "undefined" && read();
}
