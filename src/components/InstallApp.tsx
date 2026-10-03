"use client";

import { useEffect, useState } from "react";
import { Check, Download, Smartphone, TriangleAlert } from "lucide-react";
import { Button, cx } from "./ui";

/**
 * Getting DockIn onto a phone, without a file.
 *
 * The APK had become the way in, and it is the worst way in: Android refuses to
 * replace an app signed with a different key and says almost nothing about why,
 * so one re-issued signing key turns every future update into "app can't be
 * installed" with no way out but uninstalling first — which nobody guesses.
 *
 * Chrome will install this site as an app itself: same icon, same full screen,
 * same instant start, and it updates on its own because there is no file to
 * replace. That is now the main route. The APK stays for the one thing a web
 * page genuinely cannot do, which is read your notifications for payments.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp({ apkHref }: { apkHref: string }) {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);
  // Read once, as this component first mounts: both are facts about how the
  // page was opened, not state that changes under us.
  const [android] = useState(
    () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent),
  );
  const [installed, setInstalled] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true),
  );

  useEffect(() => {
    // Chrome fires this when it is willing to install the site. Holding on to it
    // is what lets the button below be a real button rather than instructions.
    const onOffer = (e: Event) => {
      e.preventDefault();
      setOffer(e as InstallEvent);
    };
    const onDone = () => {
      setInstalled(true);
      setOffer(null);
    };
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", onDone);
    return () => {
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", onDone);
    };
  }, []);

  async function install() {
    if (!offer) return;
    setBusy(true);
    try {
      await offer.prompt();
      const { outcome } = await offer.userChoice;
      if (outcome === "accepted") setInstalled(true);
    } catch {
      /* the person closed it */
    }
    setOffer(null);
    setBusy(false);
  }

  if (installed) {
    return (
      <div className="lift flex items-center gap-3 rounded-2xl bg-safe-soft p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface/70 text-safe">
          <Check size={20} />
        </span>
        <p className="text-[14.5px] font-medium text-safe">
          DockIn is installed on this phone. Open it from your home screen.
        </p>
      </div>
    );
  }

  return (
    <>
      {offer ? (
        <Button className="lift h-14 w-full text-[16px]" onClick={install} disabled={busy}>
          <Smartphone size={20} /> Install DockIn
        </Button>
      ) : (
        <div className="lift rounded-2xl bg-surface p-4">
          <p className="text-[14.5px] font-medium">Add it from your browser menu</p>
          <p className="mt-1 text-[13px] text-muted">
            {android
              ? "Chrome menu (⋮) → Add to home screen. It becomes a real app: its own icon, full screen, and it updates itself."
              : "On iPhone: Safari → Share → Add to Home Screen. On a computer, look for the install icon in the address bar."}
          </p>
        </div>
      )}

      <p className="mt-6 text-[13px] font-semibold tracking-wide text-muted uppercase">
        Only if you want automatic payments
      </p>
      <a
        href={apkHref}
        className={cx(
          "mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl",
          "bg-surface-2 text-[15px] font-medium",
        )}
      >
        <Download size={18} /> Download the Android file
      </a>
      <p className="mt-2 flex gap-2 text-[12.5px] text-muted">
        <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
        <span>
          Everything else works without this. If you already have DockIn installed from a file,
          uninstall it first — Android will not replace it otherwise, and the message it gives you
          does not say so.
        </span>
      </p>
    </>
  );
}
