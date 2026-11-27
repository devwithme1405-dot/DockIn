"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DockIn, isNativeApp } from "../native";

/**
 * DockIn 3 (assistant, outpass, self-approval) is live for everyone now.
 * These flags used to gate the screens to the preview APK; they stay as the one
 * switch every DockIn 3 surface reads, so the whole set can be turned on or off
 * in one place, and now they're on for all builds.
 */
const KEY = "dockin-channel";
const listeners = new Set<() => void>();
let asked = false;

function read(): boolean {
  return true;
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
