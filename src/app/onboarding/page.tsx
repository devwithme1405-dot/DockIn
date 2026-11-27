"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CloudUpload, Loader2, ShieldCheck } from "lucide-react";
import { saveProfile } from "@/lib/repo";
import { cx } from "@/components/ui";
import { CapTile, HeroBand } from "@/components/FirstRun";
import { SignIn } from "@/components/SignIn";
import { IntroSlides } from "@/components/Intro";
import { useAuth, accountName } from "@/lib/auth";
import { usePreview } from "@/lib/v3/flags";
import { camuNameHint, firstName } from "@/lib/identity";

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
  const v3 = usePreview();
  // DockIn 3: the nickname starts from the name MyCamu has (just made the account).
  const metaName = String(session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? "").trim() || (v3 ? firstName(camuNameHint()) : "");
  const [nameRaw, setName] = useState<string | null>(null);
  const name = nameRaw ?? metaName;
  const [target, setTarget] = useState(75);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  async function finish() {
    if (!name.trim() || busy) return;
    setBusy(true);
    await saveProfile({ name: name.trim(), target, onboarded: true });
    router.replace("/");
  }

  if (step === 0) return <IntroSlides onDone={() => setStep(1)} />;

  const first = name.trim().split(/\s+/)[0] ?? "";
  const missable = Math.floor(20 * (1 - target / 100));

  return (
    // Pinned to the screen and scrolling inside: the app's text-size zoom on
    // <html> makes dvh heights lie.
    <div className="intro-paper fixed inset-0 z-40 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col pb-[max(1.25rem,calc(var(--sab)+0.75rem))]">
        {step === 1 && (
          <div key="auth" className="step-in flex flex-1 flex-col">
            <HeroBand
              step={1}
              of={2}
              onBack={() => setStep(0)}
              title={session ? "You're in!" : creating ? "Join DockIn" : "Welcome back!"}
              sub={
                session
                  ? "Your data is backed up to this account."
                  : creating
                    ? v3
                      ? "MyCamu first — your username is your enrollment number."
                      : "Pick a username — that's all it takes."
                    : "Sign in and everything comes back, on any phone."
              }
            >
              <CapTile />
            </HeroBand>

            <div className="lift-card anim-pop relative mx-5 -mt-10 p-4" style={d(120)}>
              {session ? (
                <div className="flex items-center gap-3 py-2">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#209660] text-white">
                    <Check size={24} strokeWidth={3} className="anim-check" />
                  </span>
                  <div>
                    <p className="text-[13px] text-muted">Signed in as</p>
                    <p className="text-[17px] font-extrabold">{accountName(session.user.email)}</p>
                  </div>
                </div>
              ) : (
                <SignIn onModeChange={setCreating} />
              )}
            </div>

            <div className="mt-4 flex justify-center gap-2 px-5">
              {[
                [<CloudUpload key="c" size={14} />, "Backed up"],
                [<ShieldCheck key="s" size={14} />, "Private"],
                [<Check key="k" size={14} />, "Free"],
              ].map(([icon, label], n) => (
                <span key={String(label)} className="anim-pop flex items-center gap-1.5 rounded-full bg-[#e3f6ec] px-3 py-1.5 text-[12px] font-bold text-[#1f7f4b]" style={d(220 + n * 60)}>
                  {icon}
                  {label}
                </span>
              ))}
            </div>

            {/* Right under the form, not pinned to the bottom: the keyboard
                opening must not make it jump. */}
            <div className="px-5 pt-5">
              {session ? (
                <button onClick={() => setStep(2)} className="btn-leather flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16.5px]">
                  Continue <ArrowRight size={19} />
                </button>
              ) : (
                <button onClick={() => setStep(2)} className="mx-auto block h-11 rounded-full px-5 text-[14.5px] font-bold text-[#8a5a35] active:bg-black/5">
                  Skip for now — I&apos;ll sign in later
                </button>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div key="about" className="step-in flex flex-1 flex-col">
            <HeroBand step={2} of={2} onBack={() => setStep(1)} title={first ? `Hi ${first}!` : "Almost done!"} sub="Two quick things — you can change both later.">
              <span className="anim-pop mx-auto mb-2 grid size-16 place-items-center rounded-full bg-[#fff4e6] text-[28px] font-extrabold text-[#8a4520] shadow-[0_4px_0_rgb(60_20_5/0.35)]">
                {first ? <span key={first[0]} className="anim-pop">{first[0].toUpperCase()}</span> : <span className="hero-wave">👋</span>}
              </span>
            </HeroBand>

            <div className="lift-card anim-pop relative mx-5 -mt-10 p-4" style={d(100)}>
              <label className="block">
                <span className="mb-1.5 block text-[13.5px] font-extrabold">{v3 ? "Nickname — shown on your Today page" : "What should we call you?"}</span>
                <input
                  className="field h-14 w-full px-4 text-[18px] font-bold placeholder:font-semibold"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 40))}
                  placeholder="Type your name here"
                  autoComplete="given-name"
                  enterKeyHint="done"
                />
              </label>
            </div>

            <div className="lift-card anim-pop relative mx-5 mt-3 p-4" style={d(180)}>
              <p className="text-[13.5px] font-extrabold">Attendance your college asks for</p>
              <div className="mt-3 flex items-center gap-4">
                <span className="relative grid size-[92px] shrink-0 place-items-center">
                  <svg viewBox="0 0 92 92" className="absolute inset-0 -rotate-90" aria-hidden>
                    <circle cx="46" cy="46" r="38" fill="none" strokeWidth="10" className="stroke-[#f0e2c8]" />
                    <circle
                      cx="46"
                      cy="46"
                      r="38"
                      fill="none"
                      strokeWidth="10"
                      strokeLinecap="round"
                      stroke="url(#targetRing)"
                      strokeDasharray={`${(target / 100) * 238.8} 238.8`}
                      className="transition-[stroke-dasharray] duration-500 ease-out"
                    />
                    <defs>
                      <linearGradient id="targetRing" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#e8892f" />
                        <stop offset="1" stopColor="#8a4520" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span key={target} className="anim-pop text-[24px] font-extrabold tabular-nums text-[#5b2d14]">
                    {target}%
                  </span>
                </span>
                <p className="text-[13.5px] leading-snug text-[#6b4a33]">
                  You can miss about <b className="text-[#3b2414]">{missable} of every 20</b> classes and stay safe. DockIn keeps count for you.
                </p>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-1.5">
                {[65, 70, 75, 80, 85].map((t) => {
                  const on = target === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTarget(t)}
                      aria-pressed={on}
                      className={cx(
                        "relative h-11 rounded-xl border-[1.5px] text-[14.5px] font-extrabold transition-[transform,background-color,border-color,color] active:scale-95",
                        on ? "border-[#8a4520] bg-[#8a4520] text-white shadow-[0_3px_0_#5b2a10]" : "border-[#ead6b6] bg-white text-[#5b2d14]",
                      )}
                    >
                      {t}%
                      {t === 75 && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[#209660] px-1.5 py-px text-[8.5px] font-extrabold text-white">MOST</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto px-5 pt-6">
              <button
                onClick={() => void finish()}
                disabled={!name.trim() || busy}
                className="btn-leather flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16.5px] disabled:opacity-50"
              >
                {busy ? <Loader2 size={19} className="animate-spin" /> : null}
                {busy ? "Setting up…" : "Let's go"} {!busy && <ArrowRight size={19} />}
              </button>
              {!name.trim() && <p className="mt-2 text-center text-[12.5px] text-[#8a6a52]">Type your name to continue</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
