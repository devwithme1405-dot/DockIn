"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

/**
 * The launch screen: flat brand colour and the mark docking in, then the blue
 * opens outwards onto the app (see .boot in globals.css).
 * It is part of the server-rendered HTML so it paints on the very first frame,
 * and it matches the colour Android shows while the app opens, so there is no flash.
 */
export function BootSplash({ show, message }: { show: boolean; message?: string }) {
  const [mounted, setMounted] = useState(true);
  if (show && !mounted) setMounted(true);

  useEffect(() => {
    if (show) return;
    const t = setTimeout(() => setMounted(false), 620);
    return () => clearTimeout(t);
  }, [show]);

  if (!mounted) return null;
  return (
    <div
      className={cx("boot", !show && "boot-out")}
      role="status"
      aria-live="polite"
      aria-label={message ?? "Opening DockIn"}
    >
      <div className="boot-center">
        <span className="relative">
        <span className="boot-glow" aria-hidden />
        <svg className="boot-mark relative" width="84" height="84" viewBox="0 0 64 64" aria-hidden>
          <g className="boot-tray">
            <path d="M32 18 L50 26 L32 34 L14 26 Z" fill="#fff" />
            <path d="M20 29.5 V38 c0 3.4 5.4 6 12 6 s12 -2.6 12 -6 V29.5 L32 34.8 Z" fill="#fff" />
            <path d="M50 26 V37" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
            <circle className="boot-dot" cx="50" cy="39.4" r="2.8" fill="#fff" />
          </g>
        </svg>
        </span>
        <p className="boot-word">DockIn</p>
        <p className="boot-msg" aria-hidden={!message}>
          {message ?? " "}
        </p>
      </div>
      <p className="boot-tag">Your college, docked in.</p>
    </div>
  );
}
