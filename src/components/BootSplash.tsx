"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";
import { Cap3D } from "./Paper";

/**
 * The launch screen: the notebook's stitched leather cover with the cap landing
 * on it, then the cover opens outwards onto the app (see .boot in globals.css).
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
        <span className="boot-pop relative inline-block">
          <Cap3D size={104} />
        </span>
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
