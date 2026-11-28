"use client";

/**
 * "Install DockIn" — the nudge that turns the website into a home-screen app.
 * On Android/Chrome it fires the browser's own install prompt; on iPhone Safari
 * (which has no prompt API) it shows the Share → Add to Home Screen steps. Once
 * installed, DockIn runs full-screen like a real app — and only then can iOS
 * even offer notifications. Shows once, politely, and remembers a dismissal.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Share, X } from "lucide-react";
import { Logo } from "./Logo";

const SEEN = "dockin-install-hint";
const SNOOZE_MS = 8 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const isSafari = () => typeof navigator !== "undefined" && /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

function snoozed(): boolean {
  try {
    const t = Number(localStorage.getItem(SEEN) || 0);
    return t > 0 && Date.now() - t < SNOOZE_MS;
  } catch {
    return false;
  }
}
function snooze() {
  try {
    localStorage.setItem(SEEN, String(Date.now()));
  } catch {
    /* fine */
  }
}

interface BeforeInstall extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstall | null>(null);
  const ios = isIOS();

  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    // Android / desktop Chrome: catch the real install event.
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstall);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iPhone Safari has no event — show the manual steps after a short beat,
    // so it never lands the instant the page opens.
    let t: number | undefined;
    if (ios && isSafari()) t = window.setTimeout(() => setShow(true), 3500);

    const onInstalled = () => {
      snooze();
      setShow(false);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, [ios]);

  if (!show || typeof document === "undefined") return null;

  const close = () => {
    snooze();
    setShow(false);
  };

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* dismissed */
    }
    close();
  }

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[85] mx-auto w-full max-w-md px-3 pb-[calc(0.75rem+var(--sab,0px))]" role="dialog" aria-label="Install DockIn">
      <div className="anim-sheet-up rounded-3xl border border-line bg-card p-4 shadow-[0_12px_40px_-12px_rgba(60,20,5,0.5)]">
        <div className="flex items-start gap-3">
          <span className="shrink-0 overflow-hidden rounded-2xl">
            <Logo size={44} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] leading-tight font-extrabold">Install DockIn</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-muted">Add it to your home screen — opens full-screen like a real app, loads instantly.</p>
          </div>
          <button type="button" onClick={close} aria-label="Not now" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface">
            <X size={17} />
          </button>
        </div>

        {ios ? (
          <ol className="mt-3 space-y-2">
            <li className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-[13px]">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">1</span>
              <span className="flex flex-1 items-center gap-1.5">
                Tap the <Share size={16} className="inline text-accent" /> <b>Share</b> button below
              </span>
            </li>
            <li className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-[13px]">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">2</span>
              <span className="flex flex-1 items-center gap-1.5">
                Choose <b>Add to Home Screen</b> <Plus size={15} className="inline rounded border border-current text-accent" />
              </span>
            </li>
          </ol>
        ) : (
          <button type="button" onClick={() => void install()} className="btn-leather mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px]">
            <Plus size={18} /> Add to home screen
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
