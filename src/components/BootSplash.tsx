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
        <svg className="boot-mark relative" width="78" height="78" viewBox="0 0 64 64" aria-hidden>
          <circle className="boot-dot" cx="32" cy="18" r="6.4" fill="#2d3bda" />
          <g className="boot-tray">
            <path
              d="M16 28 V39 a9 9 0 0 0 9 9 h14 a9 9 0 0 0 9 -9 V28"
              fill="none"
              stroke="#f6f6f2"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
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
