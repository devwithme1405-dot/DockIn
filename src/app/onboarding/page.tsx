"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CloudUpload, Loader2, ShieldCheck } from "lucide-react";
import { saveProfile } from "@/lib/repo";
import { cx } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { SignIn } from "@/components/SignIn";
import { IntroSlides } from "@/components/Intro";
import { useAuth, accountName } from "@/lib/auth";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/**
 * First run: three welcome slides, then signing in (skippable), then your
 * name and the attendance your college asks for. Subjects and classes are
 * never asked — Camu has them.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [stepRaw, setStep] = useState<number | null>(null);
  // Someone already signed in (e.g. back from a sign-in link) goes straight to their name.
  const step = stepRaw ?? (session ? 2 : 0);
  const metaName = String(session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? "").trim();
  const [nameRaw, setName] = useState<string | null>(null);
  const name = nameRaw ?? metaName;
  const [target, setTarget] = useState(75);
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (!name.trim() || busy) return;
    setBusy(true);
    await saveProfile({ name: name.trim(), target, onboarded: true });
    router.replace("/");
  }

  if (step === 0) return <IntroSlides onDone={() => setStep(1)} />;

  return (
    // Pinned to the screen and scrolling inside: the app's text-size zoom on
    // <html> makes dvh heights lie.
    <div className="paper-page fixed inset-0 z-40 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6 pt-[max(1rem,calc(var(--sat)+0.5rem))] pb-[max(1.25rem,calc(var(--sab)+0.75rem))]">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep(step - 1)} aria-label="Back" disabled={busy} className="btn-paper grid size-11 shrink-0 place-items-center rounded-2xl">
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-1 gap-1.5" aria-label={`Step ${step} of 2`}>
            {[1, 2].map((n) => (
              <span key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e6d2b0] dark:bg-[#3a2b1f]">
                <span className={cx("block h-full rounded-full bg-[#a5562a] transition-transform duration-500 ease-out origin-left", n <= step ? "scale-x-100" : "scale-x-0")} />
              </span>
            ))}
          </div>
          <span className="w-11 text-right text-[12.5px] font-bold text-muted">{step}/2</span>
        </div>

        {step === 1 && (
          <div key="auth" className="step-in flex flex-1 flex-col">
            <div className="mt-7 flex items-center gap-3">
              <Logo size={52} />
              <div>
                <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-tight">Welcome to DockIn</h1>
                <p className="text-[13.5px] text-muted">Sign in to keep everything safe.</p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              {[
                [<CloudUpload key="c" size={15} />, "Backed up"],
                [<ShieldCheck key="s" size={15} />, "Private"],
                [<Check key="k" size={15} />, "Free"],
              ].map(([icon, label], n) => (
                <span key={String(label)} className="anim-pop flex items-center gap-1.5 rounded-full bg-[#e3f6ec] px-3 py-1.5 text-[12px] font-bold text-[#1f7f4b] dark:bg-[#1e3d27] dark:text-[#8fe0a5]" style={d(100 + n * 60)}>
                  {icon}
                  {label}
                </span>
              ))}
            </div>

            <div className="intro-card anim-pop mt-5 p-4" style={d(160)}>
              {session ? (
                <div className="flex items-center gap-3 py-2">
                  <span className="grid size-11 place-items-center rounded-2xl bg-[#209660] text-white">
                    <Check size={22} strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-[13px] text-muted">Signed in as</p>
                    <p className="text-[16px] font-extrabold">{accountName(session.user.email)}</p>
                  </div>
                </div>
              ) : (
                <SignIn />
              )}
            </div>

            {/* Right under the form, not pinned to the bottom: the keyboard opening
                must not make it jump. */}
            <div className="pt-5">
              {session ? (
                <button onClick={() => setStep(2)} className="btn-leather flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16.5px]">
                  Continue <ArrowRight size={19} />
                </button>
              ) : (
                <button onClick={() => setStep(2)} className="mx-auto block h-11 rounded-full px-5 text-[14.5px] font-bold text-muted active:bg-black/5">
                  Skip for now — I&apos;ll sign in later
                </button>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div key="about" className="step-in flex flex-1 flex-col">
            <h1 className="font-display mt-7 text-[28px] leading-tight font-extrabold tracking-tight">
              What should we
              <br />
              call you?
            </h1>
            <p className="mt-1.5 text-[14px] text-muted">So DockIn can greet you properly.</p>

            <label className="mt-5 block">
              <span className="sr-only">Your name</span>
              <input
                className="field h-14 w-full px-4 text-[18px] font-bold placeholder:font-semibold"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                placeholder="Type your name here"
                autoComplete="given-name"
                enterKeyHint="done"
              />
            </label>
            <p className={cx("mt-2 h-5 text-[14px] font-bold text-[#a5562a] transition-opacity duration-300", name.trim() ? "opacity-100" : "opacity-0")}>
              Hi {name.trim().split(/\s+/)[0]} 👋
            </p>

            <h2 className="mt-5 text-[17px] font-extrabold">Attendance your college asks for</h2>
            <p className="mt-0.5 text-[13px] text-muted">DockIn tells you how many classes you can miss above this.</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[65, 70, 75, 80, 85].map((t, n) => {
                const on = target === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTarget(t)}
                    aria-pressed={on}
                    className={cx(
                      "anim-pop relative flex flex-col items-center gap-1 rounded-2xl border-[1.5px] py-3 transition-[transform,background-color,border-color] active:scale-95",
                      on ? "border-[#a5562a] bg-[#fff1e0] dark:bg-[#3a2416]" : "border-card-edge bg-[#fffdf8] dark:bg-[#241a13]",
                    )}
                    style={d(80 + n * 50)}
                  >
                    <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden>
                      <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="4" className="text-[#efe0c4] dark:text-[#3a2b1f]" />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        strokeWidth="4"
                        strokeLinecap="round"
                        stroke={on ? "#a5562a" : "#d1b48c"}
                        strokeDasharray={`${(t / 100) * 88} 88`}
                        className="transition-[stroke] duration-300"
                      />
                    </svg>
                    <span className={cx("text-[15px] font-extrabold", on ? "text-[#8a4520] dark:text-[#f0b27a]" : "")}>{t}%</span>
                    {t === 75 && <span className="absolute -top-2 rounded-full bg-[#209660] px-1.5 py-px text-[9px] font-extrabold text-white">MOST</span>}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-8">
              <button
                onClick={() => void finish()}
                disabled={!name.trim() || busy}
                className="btn-leather flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16.5px] disabled:opacity-50"
              >
                {busy ? <Loader2 size={19} className="animate-spin" /> : null}
                {busy ? "Setting up…" : "Let's go"} {!busy && <ArrowRight size={19} />}
              </button>
              {!name.trim() && <p className="mt-2 text-center text-[12.5px] text-muted">Type your name to continue</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
