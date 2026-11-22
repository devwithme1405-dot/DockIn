"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Smooth reordering ("FLIP"): when items inside `box` change place — a task
 * ticked off sinks to the bottom, unticked it rises back — each one glides from
 * where it was to where it is now instead of jumping (which reads as a flicker).
 *
 * Items are found by their `data-flip` attribute (a stable id), so it works
 * even when an item moves to another list and React makes a new element.
 * `signature` should change whenever the order might have changed.
 */
export function useFlip(box: RefObject<HTMLElement | null>, signature: string): void {
  const last = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>("[data-flip]")];
    const now = new Map<string, DOMRect>();
    for (const el of items) now.set(el.dataset.flip!, el.getBoundingClientRect());
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      for (const el of items) {
        const before = last.current.get(el.dataset.flip!);
        const after = now.get(el.dataset.flip!);
        if (!before || !after) continue;
        const dy = before.top - after.top;
        if (Math.abs(dy) < 2) continue;
        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
        el.style.position = "relative";
        el.style.zIndex = "1";
        // Next frame: let it glide home.
        requestAnimationFrame(() => {
          el.style.transition = "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)";
          el.style.transform = "";
          const done = () => {
            el.style.transition = "";
            el.style.zIndex = "";
            el.style.position = "";
            el.removeEventListener("transitionend", done);
          };
          el.addEventListener("transitionend", done);
        });
      }
    }
    last.current = now;
  }, [box, signature]);
}
