"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { saveProfile, seedSampleTimetable } from "@/lib/repo";
import { Button, Chip, Field, cx, inputCls } from "@/components/ui";
import { Logo } from "@/components/Logo";

type Start = "sample" | "empty";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(75);
  const [start, setStart] = useState<Start>("sample");
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    await saveProfile({ name: name.trim(), target, onboarded: true });
    if (start === "sample") await seedSampleTimetable();
    router.replace("/");
  }

  if (step === 0) return <Welcome onStart={() => setStep(1)} />;

  return (
    <div className="flex min-h-dvh flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((i) => (
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
              What should we call you?
            </h1>
            <p className="mt-3 text-muted">Your name shows up in the greeting on the Today screen.</p>
            <div className="mt-8">
              <Field label="First name">
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sachin"
                  autoComplete="given-name"
                  autoFocus
                />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              Required attendance
            </h1>
            <p className="mt-3 text-muted">
              Bennett asks for 75%. DockIn will tell you how many classes you can still miss
              against this number.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {[75, 70, 65, 80, 85].map((t) => (
                <Chip key={t} active={target === t} onClick={() => setTarget(t)}>
                  {t}%
                </Chip>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              Set up your timetable
            </h1>
            <p className="mt-3 text-muted">You can change every subject and class later.</p>
            <div className="mt-8 space-y-3">
              <Choice
                selected={start === "sample"}
                onClick={() => setStart("sample")}
                title="Start with a sample"
                body="5 subjects and a Mon to Fri Bennett CSE week. Edit the times to match yours."
              />
              <Choice
                selected={start === "empty"}
                onClick={() => setStart("empty")}
                title="Start empty"
                body="I will add my own subjects and classes."
              />
            </div>
          </>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={busy}>
          Back
        </Button>
        {step < 3 ? (
          <Button className="flex-1" onClick={() => setStep(step + 1)}>
            Continue
          </Button>
        ) : (
          <Button className="flex-1" onClick={finish} disabled={busy}>
            {busy ? "Setting up…" : "Start using DockIn"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-[#1b2a5a] text-white">
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

      <div className="flex min-h-dvh flex-col justify-between px-6 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))]">
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
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-semibold text-on-accent shadow-[0_10px_30px_-8px_rgba(31,95,214,0.8)] transition active:scale-[0.98]"
          >
            Get Started
            <ArrowRight size={19} />
          </button>
          <p className="mt-3 text-center text-xs text-white/70">
            Free for Bennett students. Your data stays on this phone for now.
          </p>
        </div>
      </div>
    </div>
  );
}

function Choice({
  selected,
  onClick,
  title,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "w-full rounded-2xl border-2 p-4 text-left transition",
        selected ? "border-accent bg-accent-soft" : "border-line bg-surface",
      )}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-0.5 text-sm text-muted">{body}</p>
    </button>
  );
}
