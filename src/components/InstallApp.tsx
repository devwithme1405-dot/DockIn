"use client";

import { useEffect, useState } from "react";
import { Check, Download, Smartphone } from "lucide-react";
import { isNativeApp } from "@/lib/native";
import { cx } from "./ui";

/**
 * Getting DockIn onto an Android phone.
 *
 * The APK is the app now: the same screens as the site, plus everything a
 * website cannot do — reading payment notifications and asking where the money
 * went. It opens the live site, so ordinary updates arrive without reinstalling;
 * a new APK is only needed when the phone-side part changes.
 *
 * Installing the website from Chrome stays as the fallback for a phone where
 * the file will not go on, or for anyone who does not want payment reading.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp({ apkHref }: { apkHref: string }) {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  // Read once, as this component first mounts: facts about how the page was opened.
  const [android] = useState(() => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent));
  const [inApp] = useState(() => typeof window !== "undefined" && isNativeApp());

  useEffect(() => {
    const onOffer = (e: Event) => {
      e.preventDefault();
      setOffer(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onOffer);
    return () => window.removeEventListener("beforeinstallprompt", onOffer);
  }, []);

  if (inApp) {
    return (
      <div className="lift flex items-center gap-3 rounded-2xl bg-safe-soft p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface/70 text-safe">
          <Check size={20} />
        </span>
        <p className="text-[14.5px] font-medium text-safe">
          You are in the DockIn app already. To update it, download the file below and install it over this one.
        </p>
      </div>
    );
  }

  return (
    <>
      <a
        href={apkHref}
        className="lift flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-semibold text-on-accent"
      >
        <Download size={20} /> Download DockIn for Android
      </a>

      <ol className="lift mt-4 space-y-3 rounded-2xl bg-surface p-4 text-[13.5px]">
        <Li n={1}>
          <b>Play Store → your picture → Play Protect → ⚙</b> and turn off <b>Scan apps with Play Protect</b>.
          Google blocks every app from a file that can read notifications — the permission payment reading
          needs — so this is the one way past it. Turn it back on afterwards.
        </Li>
        <Li n={2}>
          Open the downloaded <b>DockIn.apk</b> and tap <b>Install</b> (or <b>Update</b> if an older DockIn is
          there — it installs over it).
        </Li>
        <Li n={3}>
          Open DockIn and <b>sign in with the same email</b>. Your classes, money and tasks come back from your
          backup. Then Profile → <b>Payments from your phone</b>: two switches, and it is done.
        </Li>
      </ol>

      {!android && (
        <p className="mt-3 text-[13px] text-muted">
          This is an Android app. Open this page on your phone to install it.
        </p>
      )}

      <p className="mt-7 text-[13px] font-semibold tracking-wide text-muted uppercase">
        Or, without payment reading
      </p>
      {offer ? (
        <button
          onClick={() => {
            void offer.prompt().catch(() => {});
            setOffer(null);
          }}
          className={cx("mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl", "bg-surface-2 text-[15px] font-medium")}
        >
          <Smartphone size={18} /> Add the website to your home screen
        </button>
      ) : (
        <p className="mt-2 text-[13px] text-muted">
          {android
            ? "Chrome menu (⋮) → Add to home screen. Same screens, updates itself, but cannot read payments."
            : "On iPhone: Safari → Share → Add to Home Screen. On a computer, use the install icon in the address bar."}
        </p>
      )}
    </>
  );
}

function Li({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
        {n}
      </span>
      <span className="min-w-0 flex-1 text-muted [&_b]:font-semibold [&_b]:text-text">{children}</span>
    </li>
  );
}
