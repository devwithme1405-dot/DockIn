"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

/**
 * The launch screen: flat brand colour, a small mark, nothing else.
 * It is part of the server-rendered HTML so it paints on the very first frame,
 * and it matches the colour Android shows while the app opens, so there is no flash.
 */
export function BootSplash({ show, message }: { show: boolean; message?: string }) {
  const [mounted, setMounted] = useState(true);
  if (show && !mounted) setMounted(true);

  useEffect(() => {
    if (show) return;
    const t = setTimeout(() => setMounted(false), 450);
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
        <svg className="boot-mark" width="84" height="84" viewBox="0 0 64 64" aria-hidden>
          <circle className="boot-dot" cx="32" cy="17.5" r="6.2" fill="#fff" />
          <g className="boot-tray">
            <rect x="12" y="29" width="40" height="22" rx="8" fill="#fff" />
            <rect x="17.5" y="22.5" width="29" height="23" rx="5.5" fill="#1f5fd6" />
          </g>
        </svg>
        <p className="boot-word">DockIn</p>
        <p className="boot-msg" aria-hidden={!message}>
          {message ?? " "}
        </p>
      </div>
      <p className="boot-tag">Your college, docked in.</p>
    </div>
  );
}
