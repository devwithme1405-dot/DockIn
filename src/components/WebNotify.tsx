"use client";

/**
 * Web / iPhone only: a one-tap prompt to turn on notifications (outpass alerts
 * and updates). iOS needs this tap — push can't be enabled silently — and the
 * banner used to live only inside the MyCamu sheet, which linked users no longer
 * open, so it was never seen. Here it sits on Today instead. It shows only once
 * the PWA is installed and permission hasn't been granted or blocked; native
 * builds (which ask through Android) render nothing.
 */

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { isNativeApp } from "@/lib/native";
import { enableWebPush, webPushState, type WebPushState } from "@/lib/webpush";
import { cx, useToast } from "./ui";

export function WebNotify({ className }: { className?: string }) {
  const toast = useToast();
  const [state, setState] = useState<WebPushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNativeApp()) return;
    // Deferred (not a synchronous setState in the effect body) so React doesn't
    // flag a cascading render; runs after mount, when window/Notification exist.
    const t = setTimeout(() => setState(webPushState()), 0);
    return () => clearTimeout(t);
  }, []);

  // Hidden when: on the app (Android asks its own way), unsupported, already on
  // or blocked, or not installed yet (the install prompt handles that first).
  if (!state || state === "unsupported" || state === "granted" || state === "denied" || state === "needs-install") return null;

  return (
    <section className={cx("px-5", className)}>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await enableWebPush();
            setState(r);
            toast.show(r === "granted" ? "Notifications on ✓" : r === "denied" ? "Blocked — turn it on in Settings" : "Couldn't turn on");
          } finally {
            setBusy(false);
          }
        }}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-accent/25 bg-accent-soft px-3.5 py-3 text-left text-[13px] font-semibold text-accent active:scale-[0.99]"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
        Turn on notifications
        <span className="ml-auto text-[11.5px] font-normal text-muted">outpass &amp; updates</span>
      </button>
    </section>
  );
}
