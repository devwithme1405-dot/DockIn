"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { DockIn, isNativeApp, onPhone } from "@/lib/native";

const CHECKED = "dockin-update-checked";
const BUILD = "dockin-native-build";

/**
 * Keeps the APK and the screens current, without trips to a download link.
 *
 * 1. A new APK installed over the old one used to keep showing the old screens:
 *    the cached copy of the website outlived the update. When the app's build
 *    number changes, the cached site is thrown away (your data is not) and the
 *    page reloads once.
 * 2. Every few hours it asks GitHub whether a newer APK exists and offers a
 *    one-tap "Update": download in the app, then Android's installer.
 */
export function AppUpdate() {
  const [offer, setOffer] = useState<{ name: string } | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;

    void DockIn.status()
      .then(async (s) => {
        const now = String(s.build ?? "");
        let before: string | null = null;
        try {
          before = localStorage.getItem(BUILD);
          localStorage.setItem(BUILD, now);
        } catch {
          return;
        }
        if (before && now && before !== now) {
          try {
            await DockIn.setLive({ on: false }).catch(() => {});
            const regs = await navigator.serviceWorker?.getRegistrations();
            await Promise.all((regs ?? []).map((r) => r.unregister()));
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          } catch {
            /* nothing cached */
          }
          window.location.reload();
        }
      })
      .catch(() => {});

    const check = () => {
      try {
        const last = Number(localStorage.getItem(CHECKED) || 0);
        if (Date.now() - last < 4 * 3_600_000) return;
        localStorage.setItem(CHECKED, String(Date.now()));
      } catch {
        /* check anyway */
      }
      void DockIn.checkUpdate()
        .then((u) => {
          if (alive && u.latest > u.current) setOffer({ name: u.name });
        })
        .catch(() => {});
    };
    const t = window.setTimeout(check, 4000);
    const off = onPhone("resume", check);
    let progress: { remove: () => void } | null = null;
    void DockIn.addListener("updateProgress", (p) => setPct(p.percent)).then((h) => (progress = h));
    return () => {
      alive = false;
      window.clearTimeout(t);
      off();
      progress?.remove();
    };
  }, []);

  if (!offer) return null;

  async function update() {
    setNote(null);
    setPct(0);
    try {
      await DockIn.installUpdate();
      setPct(null);
    } catch (e) {
      setPct(null);
      setNote(
        /ALLOW_INSTALL/.test(String(e))
          ? "Allow “Install unknown apps” for DockIn in the screen that opened, then tap Update again."
          : "The download did not finish. Try again on a better connection.",
      );
    }
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[55] mx-auto max-w-md px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
      <div className="leather stitched flex items-center gap-3 rounded-2xl px-3.5 py-3 text-on-ink shadow-lg">
        <Download size={20} className="relative z-[1] shrink-0" />
        <div className="relative z-[1] min-w-0 flex-1">
          <p className="text-[14px] font-extrabold">New DockIn update{offer.name ? ` · ${offer.name}` : ""}</p>
          <p className="text-[12px] text-ink-muted">
            {pct !== null ? `Downloading… ${pct}%` : (note ?? "Tap Update — your data stays.")}
          </p>
        </div>
        <button
          onClick={() => void update()}
          disabled={pct !== null}
          className="relative z-[1] h-9 shrink-0 rounded-full bg-orange px-3.5 text-[13.5px] font-bold text-white disabled:opacity-70"
        >
          {pct !== null ? <Loader2 size={16} className="animate-spin" /> : "Update"}
        </button>
        <button onClick={() => setOffer(null)} aria-label="Later" className="relative z-[1] grid size-8 shrink-0 place-items-center">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
