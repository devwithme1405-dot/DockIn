"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { saveProfile } from "@/lib/repo";
import { Button, Chip, Field, cx, inputCls } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { SignIn } from "@/components/SignIn";
import { useAuth, accountName } from "@/lib/auth";

/**
 * Three screens: the welcome, signing in (skippable), and your name with the
 * attendance you need. Subjects and classes are not asked for — Camu has them,
 * and in a browser they are added on the Attendance screen when wanted.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [stepRaw, setStep] = useState<number | null>(null);
  // Someone who is already signed in (e.g. just back from a sign-in link) skips straight to their name.
  const step = stepRaw ?? (session ? 2 : 0);
  const metaName = String(session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? "")
    .trim()
    .split(" ")[0];
  const [nameRaw, setName] = useState<string | null>(null);
  const name = nameRaw ?? metaName;
  const [target, setTarget] = useState(75);
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    await saveProfile({ name: name.trim(), target, onboarded: true });
    router.replace("/");
  }

  if (step === 0) return <Welcome onStart={() => setStep(1)} />;

  return (
    <div className="flex min-h-dvh flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 2`}>
        {[1, 2].map((i) => (
          <span
            key={i}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors",
              i <= step ? "bg-accent" : "bg-surface-2",
            )}
          />
        ))}
      </div>

      <div className="flex-1 pt-10">
        {step === 1 && (
          <>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              Sign in to back things up
            </h1>
            <p className="mt-3 text-muted">
              Your money, tasks and settings come back on a new phone. You can skip this and do it
              later.
            </p>
            <div className="mt-8">
              {session ? (
                <div className="rounded-2xl bg-safe-soft px-4 py-3.5">
                  <p className="text-[13px] text-muted">Signed in as</p>
                  <p className="font-semibold text-safe">{accountName(session.user.email)}</p>
                </div>
              ) : (
                <SignIn />
              )}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">About you</h1>
            <p className="mt-3 text-muted">Two quick things, both changeable later.</p>
            <div className="mt-8">
              <Field label="What should we call you?">
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sachin"
                  autoComplete="given-name"
                />
              </Field>
              <p className="mb-2.5 text-[13px] font-medium text-muted">Attendance your college asks for</p>
              <div className="flex flex-wrap gap-2.5">
                {[75, 70, 65, 80, 85].map((t) => (
                  <Chip key={t} active={target === t} onClick={() => setTarget(t)}>
                    {t}%
                  </Chip>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={busy}>
          Back
        </Button>
        {step < 2 ? (
          <Button className="flex-1" variant={!session ? "secondary" : "primary"} onClick={() => setStep(step + 1)}>
            {!session ? "Skip for now" : "Continue"}
          </Button>
        ) : (
          <Button className="flex-1" onClick={finish} disabled={busy}>
            {busy ? "Setting up…" : "Continue"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    // `fixed inset-0` covers the whole screen behind the status and navigation
    // bars (the page is viewport-fit: cover), so the image reaches every edge —
    // min-h-dvh left a strip of bare background under the gesture bar.
    <div className="fixed inset-0 isolate z-50 overflow-hidden bg-[#1b2a5a] text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/welcome.webp"
        srcSet="/welcome-sm.webp 1278w, /welcome.webp 1704w"
        sizes="100vw"
        alt=""
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 -z-20 h-full w-full object-cover object-[50%_70%]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[52%] bg-gradient-to-b from-[#0a1230]/70 via-[#0a1230]/25 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-[34%] bg-gradient-to-t from-[#0a0f24]/80 via-[#0a0f24]/35 to-transparent"
      />

      <div className="flex h-full flex-col justify-between px-6 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo size={34} />
            <span className="text-[20px] font-semibold tracking-tight drop-shadow">DockIn</span>
          </div>
          <h1 className="mt-9 text-[40px] leading-[1.08] tracking-tight drop-shadow-[0_2px_14px_rgba(5,10,35,0.55)]">
            <span className="block font-bold">Your College Life.</span>
            <span className="block font-light">In One Place.</span>
          </h1>
          <p className="mt-4 max-w-[19rem] text-[15px] leading-relaxed text-white/90 drop-shadow-[0_1px_8px_rgba(5,10,35,0.6)]">
            Track attendance, manage expenses, never miss a deadline, and stay ahead.
          </p>
        </div>

        <div>
          <button
            onClick={onStart}
            className="btn-leather flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px]"
          >
            Get Started
            <ArrowRight size={19} />
          </button>
          <p className="mt-3 text-center text-xs text-white/70">
            Free. Your data stays on this phone for now.
          </p>
        </div>
      </div>
    </div>
  );
}
