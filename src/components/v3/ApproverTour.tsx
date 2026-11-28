"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, Stamp, X } from "lucide-react";

const SEEN = "dockin-approver-tour";

type Step = { title: string; body: string };
const STEPS: Step[] = [
  {
    title: "Approve your own passes",
    body: "This is your parents' approval login. It lets you approve your own outpass right here — no waiting, no second app.",
  },
  {
    title: "Sign in just once",
    body: "Tap it and sign in with the approval login your college gave you. DockIn saves it safely — you'll never type it again.",
  },
  {
    title: "Then it's automatic",
    body: "After that one sign-in, every pass you make gets approved on its own. That's it — you're done.",
  },
];

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    /* fine */
  }
}

/**
 * A one-time, next-next walkthrough that spotlights the parents' approval login
 * button the first time a student opens the outpass screen. Points at the real
 * button (found by its data attribute); if it can't find it, it doesn't show.
 */
export function ApproverTour({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Decide once, a beat after the screen settles, whether to run.
  useEffect(() => {
    if (!enabled || seen()) return;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[data-coach="approver"]');
      if (el) setOn(true);
    }, 650);
    return () => clearTimeout(t);
  }, [enabled]);

  // Keep the spotlight on the button as the screen scrolls or rotates.
  useLayoutEffect(() => {
    if (!on) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>('[data-coach="approver"]');
      if (el) setRect(el.getBoundingClientRect());
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [on, i]);

  if (!on || typeof document === "undefined") return null;

  const close = () => {
    markSeen();
    setOn(false);
  };
  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : close());

  const pad = 8;
  const hole = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  // The card sits below the button (it's near the top of the screen).
  const cardTop = hole ? hole.top + hole.height + 14 : 120;
  const last = i === STEPS.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label="How approval works" aria-modal>
      {/* dim with a cut-out ring around the button */}
      <button type="button" aria-label="Skip" onClick={close} className="absolute inset-0 cursor-default bg-black/60" />
      {hole && (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-[var(--accent)] transition-all duration-300"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, boxShadow: "0 0 0 9999px rgba(0,0,0,0.60)" }}
        >
          <span className="absolute inset-0 animate-ping rounded-2xl ring-2 ring-[var(--accent)] opacity-40" />
        </div>
      )}

      <div
        className="anim-pop absolute right-3 left-3 mx-auto max-w-sm rounded-2xl border border-line bg-card p-4 shadow-2xl"
        style={{ top: Math.min(cardTop, (typeof window !== "undefined" ? window.innerHeight : 800) - 230) }}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Stamp size={18} />
          </span>
          <div className="flex-1">
            <p className="font-display text-[16px] leading-tight font-extrabold">{STEPS[i].title}</p>
          </div>
          <button type="button" onClick={close} aria-label="Skip" className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface">
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{STEPS[i].body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-accent" : "w-1.5 bg-line"}`} />
            ))}
          </div>
          <button type="button" onClick={next} className="btn-leather inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[13.5px] font-bold">
            {last ? (
              <>
                Got it <Check size={15} />
              </>
            ) : (
              <>
                Next <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
