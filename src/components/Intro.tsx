"use client";

import "@fontsource/kalam/latin-700.css";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { cx } from "./ui";

/** Tile colours [from, to] and the row's soft tint. */
const TINT = {
  blue: ["#5aa6f5", "#2f74d8", "linear-gradient(90deg,#e6f0fd,#f3f8ff)"],
  amber: ["#fbc74e", "#ec9a17", "linear-gradient(90deg,#fdf1d6,#fff8e8)"],
  coral: ["#f6846a", "#de5137", "linear-gradient(90deg,#fde6df,#fff3ef)"],
  green: ["#46c486", "#1f9a5f", "linear-gradient(90deg,#e0f5ea,#f1fbf5)"],
  teal: ["#3cc2c4", "#168f93", "linear-gradient(90deg,#dcf4f4,#effafa)"],
  rose: ["#f37f97", "#d44d6c", "linear-gradient(90deg,#fde4ea,#fff2f5)"],
} as const;
type Tint = keyof typeof TINT;

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const script = "font-script";

function Tile({ tint, size = 44, radius = 13, children }: { tint: Tint; size?: number; radius?: number; children: ReactNode }) {
  const [a, b] = TINT[tint];
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_3px_0_rgb(0_0_0/0.13),0_8px_14px_-8px_rgb(0_0_0/0.35)]"
      style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(160deg, ${a}, ${b})` }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-white/15" />
      <span className="relative">{children}</span>
    </span>
  );
}

/** A word on an orange brush stroke that paints itself in. */
function Brush({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("relative inline-block px-2", className)}>
      <svg aria-hidden viewBox="0 0 200 40" preserveAspectRatio="none" className="intro-brush absolute inset-x-0 bottom-[0.02em] h-[0.62em] w-full">
        <path d="M4 26 C 40 16, 90 14, 196 18 L 194 32 C 120 34, 60 36, 6 36 Z" fill="#f7b04f" opacity="0.85" />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

/** Leather curls at the bottom corners, stitched like the app's buttons. */
function LeatherCorners() {
  return (
    <svg aria-hidden viewBox="0 0 390 70" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-[64px] w-full">
      <path d="M0 18 C 40 30, 80 52, 120 70 L0 70 Z" fill="#9a4f24" />
      <path d="M0 26 C 36 37, 70 55, 100 70" fill="none" stroke="#f0c999" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.7" />
      <path d="M390 18 C 350 30, 310 52, 270 70 L390 70 Z" fill="#9a4f24" />
      <path d="M390 26 C 354 37, 320 55, 290 70" fill="none" stroke="#f0c999" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.7" />
    </svg>
  );
}

/**
 * The first three screens: what DockIn is, everything in it, and why it helps.
 * Swipe or tap; Skip goes straight to signing in.
 */
export function IntroSlides({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const last = 2;
  const go = (n: number) => {
    if (n > last) return onDone();
    setI(Math.max(0, n));
  };

  return (
    <div className="intro-paper fixed inset-0 z-50 flex flex-col overflow-hidden" role="region" aria-label="Welcome to DockIn">
      <div className="flex h-12 items-center justify-end px-4 pt-[var(--sat)]" style={{ boxSizing: "content-box" }}>
        <button onClick={onDone} className={cx("h-9 rounded-full px-3.5 text-[14px] font-bold text-[#8a5a35] transition-opacity", i === last && "pointer-events-none opacity-0")}>
          Skip
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1 touch-pan-y"
        onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(e.clientY - s.y) > 40 && Math.abs(dx) < 20) {
            start.current = null;
            setDrag(0);
            return;
          }
          setDrag((i === 0 && dx > 0) || (i === last && dx < 0) ? dx / 3 : dx);
        }}
        onPointerUp={() => {
          if (drag < -60) go(i + 1);
          else if (drag > 60) go(i - 1);
          start.current = null;
          setDrag(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(0);
        }}
      >
        <div
          className="flex h-full will-change-transform"
          style={{
            width: "300%",
            transform: `translate3d(calc(${(-i * 100) / 3}% + ${drag}px),0,0)`,
            transition: drag ? "none" : "transform 480ms cubic-bezier(0.22, 0.9, 0.25, 1)",
          }}
        >
          {[SlideOne, SlideTwo, SlideThree].map((S, n) => (
            <section key={n} aria-hidden={i !== n} className="h-full w-1/3 shrink-0 overflow-y-auto overscroll-contain px-6 [scrollbar-width:none]">
              {/* Re-mounted when shown, so its entrance plays each time. */}
              {i === n ? <S key="on" /> : <S key="off" quiet />}
            </section>
          ))}
        </div>
      </div>

      <div className="relative px-6 pt-1 pb-[max(1.5rem,calc(var(--sab)+1rem))]">
        <LeatherCorners />
        <div className="relative mb-4 flex justify-center gap-2" aria-hidden>
          {[0, 1, 2].map((n) => (
            <span key={n} className={cx("h-2.5 rounded-full transition-all duration-300", n === i ? "w-2.5 bg-[#5b2d14]" : "w-2.5 bg-[#d9c09c]")} />
          ))}
        </div>
        <div className="relative flex gap-3">
          {i > 0 && (
            <button onClick={() => go(i - 1)} aria-label="Back" className="btn-paper grid size-14 shrink-0 place-items-center rounded-full">
              <ArrowLeft size={22} />
            </button>
          )}
          <button onClick={() => go(i + 1)} className="btn-leather flex h-14 flex-1 items-center justify-center gap-2.5 rounded-full text-[17px]">
            {i === 0 ? "Get Started" : i === last ? "Let's Go" : "Next"} <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide 1

function SlideOne({ quiet }: { quiet?: boolean }) {
  const a = quiet ? "" : "anim-pop";
  return (
    <div className="flex min-h-full flex-col items-center text-center">
      <span className={cx(a, "grid size-[68px] place-items-center rounded-[20px] bg-gradient-to-b from-[#b4612d] to-[#7a3a17] text-[#fff3e2] shadow-[inset_0_1px_0_rgb(255_220_180/0.4),0_4px_0_#5b2a10,0_14px_24px_-12px_rgb(90_40_10/0.9)]")} style={d(0)}>
        <GraduationCap size={38} strokeWidth={1.9} />
      </span>
      <p className={cx(a, "mt-2 text-[24px] font-extrabold tracking-tight text-[#3b2414]")} style={d(60)}>
        DockIn
      </p>
      <h1 className={cx(a, script, "relative mt-1 text-[36px] leading-[1.05] text-[#4a2410]")} style={d(120)}>
        <span aria-hidden className="absolute top-1 -left-7 text-[#e8892f]">
          <svg width="22" height="22" viewBox="0 0 22 22" className="intro-sparks">
            <path d="M4 14 L9 9 M3 6 L10 7 M11 3 L12 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="block -rotate-3">Let&apos;s Dive into</span>
        <span className="block -rotate-3 text-[46px]">
          <Brush>DockIn</Brush>
        </span>
      </h1>
      <p className={cx(a, "mt-3 max-w-[19.5rem] text-[14.5px] leading-snug text-[#6b4a33]")} style={d(200)}>
        Your all-in-one college companion for attendance, classes, tasks, friends and much more.
      </p>
      <div className={cx(a, "my-auto w-[108%] max-w-[25rem] py-2")} style={d(260)}>
        <Campus animate={!quiet} />
      </div>
      <div className="grid w-full max-w-[22rem] grid-cols-4 gap-2.5 pt-2 pb-3">
        {(
          [
            ["blue", <BarChart3 key="a" size={26} strokeWidth={2.4} />, "Attendance"],
            ["amber", <CalendarDays key="t" size={26} strokeWidth={2.2} />, "Timetable"],
            ["coral", <UtensilsCrossed key="c" size={26} strokeWidth={2.2} />, "Cafeteria"],
            ["green", <Users key="f" size={26} strokeWidth={2.2} />, "Friends"],
          ] as [Tint, ReactNode, string][]
        ).map(([tint, icon, label], n) => {
          const [x, y] = TINT[tint];
          return (
            <span
              key={label}
              className={cx(a, "relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-[18px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_4px_0_rgb(0_0_0/0.14),0_10px_16px_-10px_rgb(0_0_0/0.45)]")}
              style={{ ...d(380 + n * 70), background: `linear-gradient(160deg, ${x}, ${y})` }}
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-white/15" />
              <span className="relative">{icon}</span>
              <span className="relative text-[11px] font-extrabold tracking-tight">{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** A pen sketch of the campus, drawing itself in. */
function Campus({ animate }: { animate: boolean }) {
  const ink = "#9a6a43";
  return (
    <svg viewBox="0 0 320 172" className={cx("h-auto w-full", animate && "intro-sketch")} aria-hidden>
      {/* sky */}
      <g fill="none" stroke={ink} strokeWidth="1.3" strokeLinecap="round" opacity="0.8">
        <path d="M28 30 q8 -10 18 -2 q10 -8 16 4 q8 0 6 8 h-42 q-6 -8 2 -10 z" fill="#fbf1df" />
        <path d="M248 22 q8 -9 17 -2 q9 -6 14 4 q7 1 5 7 h-38 q-5 -6 2 -9 z" fill="#fbf1df" />
        <path d="M206 30 l4 -3 4 3 M220 24 l3 -2 3 2" />
      </g>
      {/* ground */}
      <path d="M6 156 C 80 152, 240 152, 314 156" fill="none" stroke={ink} strokeWidth="1.4" />
      {/* left wing */}
      <g stroke={ink} strokeWidth="1.3" strokeLinejoin="round">
        <path d="M54 154 V 78 L 98 66 V 154 Z" fill="#ecd3ad" />
        {[90, 102, 114, 126, 138].map((y) => (
          <path key={y} d={`M58 ${y + 2} L94 ${y - 8}`} fill="none" opacity="0.7" />
        ))}
        {[64, 74, 84].map((x) => (
          <path key={x} d={`M${x} ${154} V ${78 - (x - 54) * 0.27}`} fill="none" opacity="0.55" />
        ))}
      </g>
      {/* main block */}
      <g stroke={ink} strokeWidth="1.3" strokeLinejoin="round">
        <path d="M98 154 V 50 L 262 40 V 154 Z" fill="#f6e6cb" />
        <path d="M94 50 L 266 39 L 266 33 L 94 44 Z" fill="#e6c79c" />
        {[64, 78, 92, 106, 120].map((y, n) => (
          <path key={y} d={`M98 ${y} L262 ${y - 9 + n * 0}`} fill="none" />
        ))}
        {Array.from({ length: 13 }, (_, n) => 110 + n * 12).map((x) => (
          <path key={x} d={`M${x} ${130} V ${50 - ((x - 98) / 164) * 10}`} fill="none" opacity="0.45" />
        ))}
        {/* glass band */}
        <path d="M98 130 L262 124 V 154 H 98 Z" fill="#fbf3e4" />
        {/* entrance */}
        <path d="M156 154 V 132 H 204 V 154" fill="#d9b88a" />
        <path d="M150 132 H 210 V 127 H 150 Z" fill="#b98a5a" />
        <path d="M180 132 V 154" fill="none" />
      </g>
      {/* trees and bushes */}
      <g stroke={ink} strokeWidth="1.2">
        <path d="M26 154 V 120" fill="none" />
        <circle cx="26" cy="112" r="16" fill="#e9c98f" />
        <circle cx="16" cy="122" r="9" fill="#e3bd7c" />
        <circle cx="38" cy="122" r="10" fill="#e3bd7c" />
        <path d="M292 154 V 118" fill="none" />
        <circle cx="292" cy="108" r="17" fill="#e9c98f" />
        <circle cx="280" cy="120" r="10" fill="#e3bd7c" />
        <circle cx="304" cy="121" r="9" fill="#e3bd7c" />
        {[70, 112, 230, 250].map((x) => (
          <ellipse key={x} cx={x} cy="152" rx="11" ry="6" fill="#e6c48a" />
        ))}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Slide 2

const FEATURES: { tint: Tint; icon: ReactNode; title: string; sub: string; art: ReactNode }[] = [
  { tint: "blue", icon: <CalendarDays size={22} />, title: "Classes & Timetable", sub: "Your daily schedule, always in sync", art: <ArtBooks /> },
  { tint: "green", icon: <BarChart3 size={22} />, title: "Attendance Tracker", sub: "From Camu — know how many you can bunk", art: <ArtChart /> },
  { tint: "amber", icon: <UtensilsCrossed size={22} />, title: "Cafeteria Menu", sub: "Today's meals and your mess pass", art: <ArtBowl /> },
  { tint: "coral", icon: <ClipboardCheck size={22} />, title: "Tasks & Deadlines", sub: "LMS assignments land here by themselves", art: <ArtClipboard /> },
  { tint: "teal", icon: <Users size={22} />, title: "Friends Hub", sub: "Chat, share solutions, compare attendance", art: <ArtPeople /> },
  { tint: "rose", icon: <BellRing size={22} />, title: "Smart Reminders", sub: "Before a class, a deadline or an exam", art: <ArtPlane /> },
];

function SlideTwo({ quiet }: { quiet?: boolean }) {
  const a = quiet ? "" : "anim-pop";
  return (
    <div className="pb-3">
      {/* pins on a string across the top of the page */}
      <svg aria-hidden viewBox="0 0 340 26" className="mb-2 h-auto w-full">
        <path d="M4 6 C 110 12, 230 12, 336 6" fill="none" stroke="#c99668" strokeWidth="1.2" />
        {Array.from({ length: 10 }, (_, n) => {
          const x = 18 + n * 34;
          return (
            <g key={n} className={quiet ? "" : "intro-pin"} style={d(n * 40)}>
              <path d={`M${x} 9 V 18`} stroke="#b07a4c" strokeWidth="1.4" />
              <circle cx={x} cy="21" r="3.6" fill="#d9772b" />
            </g>
          );
        })}
      </svg>
      <h1 className={cx(a, "text-center text-[29px] leading-[1.12] font-extrabold tracking-tight text-[#3b2414]")}>
        Everything You Need
        <br />
        in{" "}
        <span className={cx(script, "text-[34px] text-[#5b2d14]")}>
          <Brush>One App</Brush>
        </span>
      </h1>
      <p className={cx(a, "mt-2 text-center text-[14px] text-[#6b4a33]")} style={d(60)}>
        A smarter and simpler college life.
      </p>
      <ul className="mt-4 space-y-2.5">
        {FEATURES.map((f, n) => (
          <li
            key={f.title}
            className={cx(quiet ? "" : "anim-slide-r", "flex items-center gap-3 rounded-[18px] border border-black/[0.06] p-2.5 pr-2 shadow-[0_6px_14px_-12px_rgb(90_50_20/0.8)]")}
            style={{ ...d(120 + n * 70), background: TINT[f.tint][2] }}
          >
            <Tile tint={f.tint}>{f.icon}</Tile>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[14.5px] font-extrabold text-[#2e1b0e]">{f.title}</span>
              <span className="block text-[11.5px] leading-snug text-[#6b4a33]">{f.sub}</span>
            </span>
            <span className="h-9 w-12 shrink-0">{f.art}</span>
            <ChevronRight size={18} className="shrink-0 text-[#2f74d8]/60" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArtBooks() {
  return (
    <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden>
      <rect x="6" y="24" width="34" height="8" rx="1.5" fill="#d9772b" />
      <rect x="9" y="16" width="30" height="8" rx="1.5" fill="#3d7fd6" />
      <rect x="5" y="8" width="32" height="8" rx="1.5" fill="#b5652f" />
      <path d="M8 12 H 30 M10 20 H 34 M9 28 H 36" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  );
}
function ArtChart() {
  return (
    <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden>
      <rect x="6" y="3" width="36" height="30" rx="3" fill="#fff" stroke="#d8c3a2" transform="rotate(-6 24 18)" />
      <path d="M11 26 L19 19 L25 22 L36 10" fill="none" stroke="#1f9a5f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" transform="rotate(-6 24 18)" />
      <text x="26" y="31" fontSize="7" fontWeight="800" fill="#2e1b0e" transform="rotate(-6 24 18)">
        85%
      </text>
    </svg>
  );
}
function ArtBowl() {
  return (
    <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden>
      <path d="M14 13 q2 -6 4 0 q2 -6 4 0 q2 -6 4 0 q2 -6 4 0" fill="none" stroke="#e5951a" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 16 H 42 C 42 27, 34 32, 24 32 C 14 32, 6 27, 6 16 Z" fill="#de5137" />
      <path d="M6 16 H 42" stroke="#fbc74e" strokeWidth="2.5" />
      <path d="M34 4 L 26 15 M38 6 L 29 15" stroke="#8a5a35" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function ArtClipboard() {
  return (
    <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden>
      <rect x="12" y="4" width="24" height="30" rx="3" fill="#b5652f" />
      <rect x="15" y="8" width="18" height="23" rx="1.5" fill="#fff" />
      <rect x="19" y="2" width="10" height="5" rx="1.5" fill="#7a3a17" />
      {[13, 19, 25].map((y) => (
        <g key={y}>
          <path d={`M17.5 ${y} l1.6 1.6 l2.6 -3`} fill="none" stroke="#de5137" strokeWidth="1.4" strokeLinecap="round" />
          <path d={`M24 ${y} H 31`} stroke="#d8c3a2" strokeWidth="1.4" />
        </g>
      ))}
    </svg>
  );
}
function ArtPeople() {
  return (
    <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden>
      <circle cx="13" cy="13" r="5" fill="#f2b37e" />
      <path d="M5 32 c0 -8 4 -12 8 -12 s8 4 8 12 z" fill="#3cc2c4" />
      <circle cx="35" cy="13" r="5" fill="#e09a63" />
      <path d="M27 32 c0 -8 4 -12 8 -12 s8 4 8 12 z" fill="#f6846a" />
      <circle cx="24" cy="10" r="6" fill="#c97d47" />
      <path d="M14 33 c0 -10 5 -15 10 -15 s10 5 10 15 z" fill="#d9772b" />
    </svg>
  );
}
function ArtPlane() {
  return (
    <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden>
      <path d="M6 30 C 14 26, 16 20, 22 22" fill="none" stroke="#d8a77c" strokeWidth="1.3" strokeDasharray="2.5 3" />
      <path d="M20 18 L 44 6 L 34 30 L 29 21 Z" fill="#fbc74e" stroke="#c98a1a" strokeWidth="1" strokeLinejoin="round" />
      <path d="M29 21 L 44 6" stroke="#c98a1a" strokeWidth="1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Slide 3

function SlideThree({ quiet }: { quiet?: boolean }) {
  const a = quiet ? "" : "anim-pop";
  return (
    <div className="flex min-h-full flex-col items-center pb-3 text-center">
      <div className={cx(a, "w-full max-w-[19rem]")}>
        <Desk animate={!quiet} />
      </div>
      <h1 className={cx(a, script, "mt-1 text-[38px] leading-[1.02] text-[#4a2410]")} style={d(120)}>
        <span className="block -rotate-2">Stay Organized,</span>
        <span className="relative block -rotate-2">
          Stay Ahead
          <svg aria-hidden viewBox="0 0 200 20" className="intro-swoosh absolute -bottom-2 left-1/2 h-4 w-[70%] -translate-x-1/2">
            <path d="M6 14 C 60 4, 140 4, 194 10" fill="none" stroke="#e8892f" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </span>
      </h1>
      <ul className="mt-6 w-full space-y-2.5 text-left">
        {(
          [
            ["amber", <Zap key="z" size={22} />, "Save Time", "All college essentials in one place"],
            ["blue", <TrendingUp key="t" size={22} />, "Make Better Plans", "Know exactly how many classes you can miss"],
            ["coral", <Users key="u" size={22} />, "Stay Connected", "With your friends and your college life"],
          ] as [Tint, ReactNode, string, string][]
        ).map(([tint, icon, title, sub], n) => (
          <li
            key={title}
            className={cx(quiet ? "" : "anim-slide-r", "flex items-center gap-3.5 rounded-[18px] border border-[#ead6b6] bg-[#fffaf1] p-3 shadow-[0_8px_16px_-14px_rgb(90_50_20/0.9)]")}
            style={d(240 + n * 90)}
          >
            <Tile tint={tint} size={48} radius={14}>
              {icon}
            </Tile>
            <span className="min-w-0">
              <span className="block text-[16px] font-extrabold text-[#2e1b0e]">{title}</span>
              <span className="block text-[12.5px] leading-snug text-[#6b4a33]">{sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Books, a spiral checklist ticking itself, a pencil cup, a backpack and a plant. */
function Desk({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 300 190" className="h-auto w-full" aria-hidden>
      {/* sparks */}
      <g stroke="#e8892f" strokeWidth="3" strokeLinecap="round" className={animate ? "intro-sparks" : ""}>
        <path d="M232 22 l6 -10 M246 30 l10 -6 M250 44 l11 0" />
      </g>
      {/* plant */}
      <g>
        <path d="M44 120 C 30 90, 20 70, 30 50" fill="none" stroke="#5d8a3a" strokeWidth="2" />
        {[
          [30, 52, -30],
          [24, 72, -50],
          [34, 86, 20],
          [22, 98, -60],
          [42, 66, 30],
        ].map(([x, y, r], n) => (
          <ellipse key={n} cx={x} cy={y} rx="11" ry="5" fill={n % 2 ? "#7cb24e" : "#5d9a3c"} transform={`rotate(${r} ${x} ${y})`} />
        ))}
      </g>
      {/* books */}
      <g stroke="#6b3b1c" strokeWidth="1">
        <rect x="18" y="150" width="120" height="18" rx="3" fill="#2f6fbf" />
        <rect x="24" y="132" width="110" height="18" rx="3" fill="#d9772b" />
        <rect x="14" y="114" width="116" height="18" rx="3" fill="#8a4520" />
        <path d="M22 159 H 130 M30 141 H 126 M20 123 H 122" stroke="#fff" strokeOpacity="0.45" />
      </g>
      {/* spiral notepad with checklist */}
      <g transform="rotate(-4 160 70)">
        <rect x="104" y="22" width="112" height="100" rx="8" fill="#fffdf6" stroke="#c9a77a" strokeWidth="1.4" />
        {Array.from({ length: 8 }, (_, n) => (
          <rect key={n} x={112 + n * 13} y="15" width="5" height="13" rx="2.5" fill="#a5652f" />
        ))}
        {[44, 66, 88].map((y, n) => (
          <g key={y}>
            <rect x="116" y={y - 7} width="13" height="13" rx="3" fill="#fff" stroke="#c9a77a" strokeWidth="1.3" />
            <path d={`M118.5 ${y} l3.2 3.2 l5.5 -6.4`} fill="none" stroke="#209660" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={animate ? "intro-check" : ""} style={d(500 + n * 350)} />
            <path d={`M136 ${y} H ${196 - n * 12}`} stroke="#d4b98f" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        ))}
      </g>
      {/* pencil cup */}
      <g>
        <path d="M186 168 L 182 128 H 214 L 210 168 Z" fill="#d9772b" stroke="#8a4520" strokeWidth="1.2" />
        <path d="M190 128 L 186 96 M198 128 L 200 92 M206 128 L 214 100" stroke="#2f6fbf" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M198 128 L 200 92" stroke="#f2b33d" strokeWidth="3.4" strokeLinecap="round" />
      </g>
      {/* backpack */}
      <g stroke="#6b3b1c" strokeWidth="1.3">
        <path d="M226 168 V 100 C 226 82, 290 82, 290 100 V 168 Z" fill="#a85a28" />
        <path d="M244 88 C 244 70, 272 70, 272 88" fill="none" strokeWidth="3" />
        <rect x="234" y="124" width="48" height="34" rx="6" fill="#c06e34" />
        <path d="M234 136 H 282" />
        <rect x="254" y="128" width="8" height="5" rx="1" fill="#f2c27e" />
      </g>
      <path d="M0 170 H 300" stroke="#c9a77a" strokeWidth="1.2" />
    </svg>
  );
}
