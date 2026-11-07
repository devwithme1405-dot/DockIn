"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CloudUpload } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCollege } from "@/lib/college";
import { isNativeApp } from "@/lib/native";
import { markSetupSeen } from "@/lib/setup";
import { ConnectCamu, ConnectLms } from "@/components/College";
import { PhoneSetup, usePhoneStatus } from "@/components/PhoneSetup";
import { SignIn } from "@/components/SignIn";
import { cx } from "@/components/ui";

/**
 * Everything DockIn needs from the phone, on one screen, once.
 *
 * Four things, each one tap: back up, Camu, the LMS, and the two switches for
 * payments. Each line ticks itself the moment it is done — including the ones
 * finished in Android's own Settings — and anything skipped can be done later
 * from Profile.
 */
export default function SetupPage() {
  const router = useRouter();
  const { session, configured } = useAuth();
  const { state } = useCollege();
  const { status } = usePhoneStatus();
  const [signing, setSigning] = useState(false);
  const [native] = useState(() => typeof window !== "undefined" && isNativeApp());

  useEffect(() => {
    if (!native) router.replace("/");
  }, [native, router]);

  const steps = [
    !configured || !!session,
    !!state.camu?.connected && !state.camu.expired,
    !!state.lms?.connected,
    !!status?.listening && status.notifications === "granted",
  ];
  const done = steps.filter(Boolean).length;
  const all = done === steps.length;

  function finish() {
    markSetupSeen();
    router.replace("/");
  }

  if (!native) return null;

  return (
    <div className="page-wash min-h-dvh px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <p className="text-[13px] font-semibold tracking-wide text-accent uppercase">
        {done} of {steps.length} done
      </p>
      <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">
        {all ? "All set." : "Set up DockIn once"}
      </h1>
      <p className="mt-2 text-[14.5px] text-muted">
        {all
          ? "Attendance, assignments and payments now come in by themselves."
          : "Each line is one tap. After this, DockIn fills itself in."}
      </p>
      <div className="mt-4 flex gap-1.5" aria-hidden>
        {steps.map((ok, i) => (
          <span key={i} className={cx("h-1 flex-1 rounded-full transition-colors", ok ? "bg-safe" : "bg-surface-2")} />
        ))}
      </div>

      {configured && (
        <section className="lift mt-6 rounded-3xl bg-surface p-4">
          <div className="flex items-start gap-3">
            <span
              className={cx(
                "grid size-10 shrink-0 place-items-center rounded-2xl",
                session ? "bg-safe-soft text-safe" : "bg-accent-soft text-accent",
              )}
            >
              {session ? <Check size={19} strokeWidth={2.5} /> : <CloudUpload size={19} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">{session ? "Backed up" : "Back up your data"}</p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {session
                  ? `Signed in as ${session.user.email}`
                  : "Sign in with your email, so a new phone gets everything back."}
              </p>
            </div>
            {!session && !signing && (
              <button
                onClick={() => setSigning(true)}
                className="h-9 shrink-0 rounded-full bg-accent px-3.5 text-[13px] font-medium text-on-accent"
              >
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

      <section className="lift mt-3 rounded-3xl bg-surface px-4 py-1" aria-label="College">
        <div className="border-b border-line">
          <ConnectCamu compact />
        </div>
        <ConnectLms compact />
      </section>

      <div className="mt-3">
        <PhoneSetup />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md bg-gradient-to-t from-bg via-bg to-bg/0 px-5 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          onClick={finish}
          className={cx(
            "flex h-13 w-full items-center justify-center rounded-2xl py-3.5 text-[16px] font-semibold transition active:scale-[0.98]",
            all ? "bg-accent text-on-accent" : "bg-surface-2 text-text",
          )}
        >
          {all ? "Start using DockIn" : "Skip the rest for now"}
        </button>
      </div>
    </div>
  );
}
