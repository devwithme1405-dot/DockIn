"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CloudUpload } from "lucide-react";
import { useAuth, accountName } from "@/lib/auth";
import { useCollege } from "@/lib/college";
import { isNativeApp } from "@/lib/native";
import { markSetupSeen } from "@/lib/setup";
import { ConnectCamu, ConnectLms } from "@/components/College";
import { SignIn } from "@/components/SignIn";
import { cx } from "@/components/ui";

/**
 * Everything DockIn needs from the phone, on one screen, once.
 *
 * Three things, each one tap: back up, Camu and the LMS. Each line ticks itself the moment it is done — including the ones
 * finished in Android's own Settings — and anything skipped can be done later
 * from Profile.
 */
export default function SetupPage() {
  const router = useRouter();
  const { session, configured } = useAuth();
  const { state } = useCollege();
  const [signing, setSigning] = useState(false);
  const [native] = useState(
    () => typeof window !== "undefined" && isNativeApp(),
  );

  useEffect(() => {
    if (!native) router.replace("/");
  }, [native, router]);

  // Notifications are not a step: Android's own dialog asks for them once,
  // by itself (NotifyAsk), so this screen is only about your accounts.
  const steps = [
    !configured || !!session,
    !!state.camu?.connected && !state.camu.expired,
    !!state.lms?.connected,
  ];
  const done = steps.filter(Boolean).length;
  const all = done === steps.length;

  function finish() {
    markSetupSeen();
    router.replace("/");
  }

  if (!native) return null;

  const pct = done / steps.length;
  return (
    // Pinned to the screen and scrolling inside, for the same reason as onboarding:
    // dvh heights are unreliable under the text-size zoom.
    <div className="paper-page fixed inset-0 z-40 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-md px-5 pt-[max(1.25rem,calc(var(--sat)+0.75rem))] pb-[calc(7.5rem+var(--sab))]">
        <div className="step-in flex items-center gap-4">
          <span className="relative grid size-[72px] shrink-0 place-items-center">
            <svg viewBox="0 0 72 72" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="36" cy="36" r="30" fill="none" strokeWidth="7" className="stroke-[#e6d2b0] dark:stroke-[#3a2b1f]" />
              <circle
                cx="36"
                cy="36"
                r="30"
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                stroke={all ? "#209660" : "#a5562a"}
                strokeDasharray={`${pct * 188.5} 188.5`}
                className="transition-[stroke-dasharray,stroke] duration-700 ease-out"
              />
            </svg>
            {all ? <Check size={30} strokeWidth={3} className="anim-check text-[#209660]" /> : <span className="text-[17px] font-extrabold">{done}/{steps.length}</span>}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-tight">{all ? "You're all set!" : "Connect your college"}</h1>
            <p className="mt-1 text-[13.5px] leading-snug text-muted">
              {all ? "Attendance and assignments now come in by themselves." : "One tap each. After this, DockIn fills itself in."}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-2.5">
          {configured && (
            <section className="account-card anim-pop rounded-3xl p-4" style={{ "--d": "80ms" } as CSSProperties}>
              <div className="flex items-start gap-3">
                <span className={cx("grid size-10 shrink-0 place-items-center rounded-2xl", session ? "bg-safe-soft text-safe" : "bg-[#fff1e0] text-[#a5562a] dark:bg-[#3a2416]")}>
                  {session ? <Check size={19} strokeWidth={2.5} /> : <CloudUpload size={19} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold">{session ? "Backed up" : "Back up your data"}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                    {session ? `Signed in as ${accountName(session.user.email)}` : "Sign in so a new phone gets everything back."}
                  </p>
                </div>
                {!session && !signing && (
                  <button onClick={() => setSigning(true)} className="btn-connect h-9 shrink-0 rounded-full px-4 text-[13px] font-bold">
                    Sign in
                  </button>
                )}
              </div>
              {!session && signing && (
                <div className="mt-4">
                  <SignIn />
                </div>
              )}
            </section>
          )}
          <div className="anim-pop" style={{ "--d": "140ms" } as CSSProperties}>
            <ConnectCamu />
          </div>
          <div className="anim-pop" style={{ "--d": "200ms" } as CSSProperties}>
            <ConnectLms />
          </div>
          <p className="anim-pop px-2 pt-1 text-center text-[12px] text-muted" style={{ "--d": "260ms" } as CSSProperties}>
            Your Camu and LMS logins stay encrypted on this phone. You can change any of this later in Profile.
          </p>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md bg-gradient-to-t from-bg via-bg/95 to-bg/0 px-5 pt-8 pb-[max(1rem,calc(var(--sab)+0.5rem))]">
          <button
            onClick={finish}
            className={cx(
              "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold transition active:scale-[0.98]",
              all ? "btn-leather" : "btn-paper",
            )}
          >
            {all ? (
              <>
                Start using DockIn <ArrowRight size={19} />
              </>
            ) : (
              "Skip the rest for now"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
