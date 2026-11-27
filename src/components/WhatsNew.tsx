"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, DoorOpen, Mail, Mic, Sparkles, Stamp, Wand2, X } from "lucide-react";
import { usePreview } from "@/lib/v3/flags";
import { openOutpass } from "@/lib/v3/ui";
import { cx } from "./ui";

/**
 * The big "what's new" announcement for the Outpass + self-approval update.
 * Shows once per device (a flag is set the moment it appears, so it never comes
 * back), and only where the feature is live — the preview channel for now, then
 * everyone when Outpass ships. Change SEEN to re-announce a future update.
 */
const SEEN = "dockin-whatsnew-outpass-1";

const FEATURES = [
  {
    Icon: Wand2,
    cls: "bg-run-soft text-run",
    title: "Just say it — pass in seconds",
    body: "Type or speak “kal 4 baje market” and DockIn fills the whole MyCamu form for you. No menus, no forms.",
  },
  {
    Icon: Stamp,
    cls: "bg-safe-soft text-safe",
    title: "Approve it yourself — one tap",
    body: "Save your parent's approval login once. Then approve your own gate pass right here — no second app, no signing in again.",
  },
  {
    Icon: Mail,
    cls: "bg-warn-soft text-warn",
    title: "Warden mail, written for you",
    body: "Leave Out Pass? DockIn writes the warden mail with your name, dates and times — ready to send.",
  },
] as const;

export function WhatsNew() {
  const preview = usePreview();
  const [show, setShow] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!preview) return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN) === "1";
    } catch {
      /* private mode */
    }
    if (seen) return;
    const t = setTimeout(() => setShow(true), 900);
    return () => clearTimeout(t);
  }, [preview]);

  // Let the backdrop dismiss only after it has settled, so a stray tap as it
  // appears can't close it instantly.
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setArmed(true), 500);
    return () => clearTimeout(t);
  }, [show]);

  if (!show || typeof document === "undefined") return null;

  // Dismiss for good — remembered so it never comes back.
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      /* private mode */
    }
  };
  const onDim = () => {
    if (armed) dismiss();
  };

  return createPortal(
    <div className="wn-dim" onClick={onDim} role="dialog" aria-modal="true" aria-label="What's new in DockIn">
      <div className="wn-card" onClick={(e) => e.stopPropagation()}>
        {/* hero */}
        <div className="wn-hero">
          <span className="wn-shine" aria-hidden />
          <span className="wn-drift" style={{ top: "14%", right: "12%" }} aria-hidden>
            <DoorOpen size={26} />
          </span>
          <span className="wn-drift" style={{ top: "54%", right: "26%", animationDelay: "1.1s" }} aria-hidden>
            <Mic size={20} />
          </span>
          <span className="wn-drift" style={{ top: "30%", left: "8%", animationDelay: "0.6s" }} aria-hidden>
            <Stamp size={22} />
          </span>

          <button type="button" onClick={dismiss} aria-label="Close" className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-white/15 text-white active:bg-white/25">
            <X size={18} />
          </button>

          <span className="wn-ribbon">
            <Sparkles size={13} /> Biggest update yet
          </span>
          <h2 className="font-display mt-3 text-[30px] leading-[1.02] font-extrabold">
            Outpass,
            <br />
            in seconds.
          </h2>
          <p className="mt-2 max-w-[20rem] text-[13.5px] leading-snug text-[#ffe6cc]">Make it, approve it, done — without ever leaving DockIn.</p>
        </div>

        {/* features */}
        <div className="space-y-3.5 px-5 pt-5">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="wn-row flex items-start gap-3" style={{ "--d": `${180 + i * 110}ms` } as React.CSSProperties}>
              <span className={cx("mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl", f.cls)}>
                <f.Icon size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold leading-tight">{f.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{f.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* actions */}
        <div className="px-5 pt-5 pb-[max(1.25rem,var(--sab))]">
          <button
            type="button"
            onClick={() => {
              dismiss();
              openOutpass("new");
            }}
            className="btn-leather flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold"
          >
            Make a pass <ArrowRight size={19} />
          </button>
          <button type="button" onClick={dismiss} className="mt-2 h-10 w-full rounded-2xl text-[13.5px] font-bold text-muted active:bg-black/5">
            Maybe later
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
