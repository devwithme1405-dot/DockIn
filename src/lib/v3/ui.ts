"use client";

import { useSyncExternalStore } from "react";
import type { PassDraft } from "../outpass";

/** Which DockIn 3 screen is open, from anywhere (the floating button, Profile, a card). */
export interface V3Screens {
  ask: boolean;
  /** Outpass: closed, or open on a tab (with a draft to start from). */
  pass: null | { tab: "new" | "history"; draft?: PassDraft; focus?: string };
}

let state: V3Screens = { ask: false, pass: null };
const listeners = new Set<() => void>();
const set = (next: Partial<V3Screens>) => {
  state = { ...state, ...next };
  listeners.forEach((f) => f());
};

export const openAssistant = () => set({ ask: true });
export const closeAssistant = () => set({ ask: false });
export const openOutpass = (tab: "new" | "history" = "new", draft?: PassDraft, focus?: string) => set({ pass: { tab, draft, focus } });
export const closeOutpass = () => set({ pass: null });

export function useV3Screens(): V3Screens {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
    () => state,
  );
}
