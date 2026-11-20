"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  MessagesSquare,
  Timer,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { Logo } from "./Logo";
import { cx } from "./ui";

/** Soft colour pairs for feature tiles: [tile from, tile to, row tint]. No purple. */
const TINT = {
  blue: ["#4b9bf0", "#2f6fd6", "#e8f1fd"],
  amber: ["#f7bf45", "#e5951a", "#fdf3dd"],
  coral: ["#f37c62", "#d9533b", "#fdebe6"],
  green: ["#3fc07f", "#209660", "#e3f6ec"],
  teal: ["#35bfc0", "#1a9195", "#e0f5f5"],
  rose: ["#f2768f", "#d24a68", "#fde8ed"],
} as const;
type Tint = keyof typeof TINT;

function Tile({ tint, children, size = 44 }: { tint: Tint; children: ReactNode; size?: number }) {
  const [a, b] = TINT[tint];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[14px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_3px_0_rgb(0_0_0/0.12)]"
      style={{ width: size, height: size, background: `linear-gradient(160deg, ${a}, ${b})` }}
    >
      {children}
    </span>
  );
}

/** A word on an orange highlighter stroke. */
function Marker({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block px-1">
      <span aria-hidden className="intro-marker absolute inset-x-0 bottom-[0.08em] h-[0.5em] -skew-x-6 rounded-md bg-[#f7b55a]/70" />
      <span className="relative">{children}</span>
    </span>
  );
}

const FEATURES: { tint: Tint; icon: ReactNode; title: string; sub: string }[] = [
  { tint: "blue", icon: <BarChart3 size={21} />, title: "Attendance tracker", sub: "Straight from Camu — with how many you can bunk" },
  { tint: "amber", icon: <CalendarDays size={21} />, title: "Classes & timetable", sub: "Today's classes and rooms, always in sync" },
  { tint: "coral", icon: <ClipboardCheck size={21} />, title: "Tasks & LMS deadlines", sub: "Assignments arrive by themselves; submit from here" },
  { tint: "green", icon: <UtensilsCrossed size={21} />, title: "Cafeteria", sub: "Today's menu and your mess pass in one tap" },
  { tint: "teal", icon: <MessagesSquare size={21} />, title: "Friends & groups", sub: "Chat, share solutions, compare attendance" },
  { tint: "rose", icon: <BellRing size={21} />, title: "Smart reminders", sub: "Before a class, a deadline or an exam" },
];

/**
 * The first three screens: what DockIn is, everything in it, and why it helps.
 * Swipe or tap Next; Skip goes straight to signing in.
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
    <div className="paper-page fixed inset-0 z-50 flex flex-col overflow-hidden" role="region" aria-label="Welcome to DockIn">
      <div className="flex items-center justify-end px-5 pt-[max(0.9rem,calc(var(--sat)+0.4rem))]">
        <button
          onClick={onDone}
          className={cx("h-9 rounded-full px-3.5 text-[14px] font-bold text-[#8a5a35] transition-opacity", i === last && "pointer-events-none opacity-0")}
        >
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
          // A little resistance at either end.
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
          className="flex h-full"
          style={{
            width: "300%",
            transform: `translateX(calc(${(-i * 100) / 3}% + ${drag}px))`,
            transition: drag ? "none" : "transform 460ms cubic-bezier(0.22, 0.9, 0.25, 1)",
          }}
        >
          <Slide active={i === 0}>
            <SlideOne active={i === 0} />
          </Slide>
          <Slide active={i === 1}>
            <SlideTwo active={i === 1} />
          </Slide>
          <Slide active={i === 2}>
            <SlideThree active={i === 2} />
          </Slide>
        </div>
      </div>

      <div className="px-6 pt-2 pb-[max(1.25rem,calc(var(--sab)+0.75rem))]">
        <div className="mb-4 flex justify-center gap-2" aria-hidden>
          {[0, 1, 2].map((n) => (
            <span key={n} className={cx("h-2 rounded-full transition-all duration-300", n === i ? "w-6 bg-[#8a4520]" : "w-2 bg-[#d8bf98]")} />
          ))}
        </div>
        <div className="flex gap-3">
          {i > 0 && (
            <button onClick={() => go(i - 1)} aria-label="Back" className="btn-paper grid size-14 shrink-0 place-items-center rounded-2xl">
              <ArrowLeft size={21} />
            </button>
          )}
          <button onClick={() => go(i + 1)} className="btn-leather flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-[16.5px]">
            {i === 0 ? "Get Started" : i === last ? "Let's Go" : "Next"} <ArrowRight size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Slide({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <section aria-hidden={!active} className="h-full w-1/3 shrink-0 overflow-y-auto overscroll-contain px-6 [scrollbar-width:none]">
      {children}
    </section>
  );
}

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function SlideOne({ active }: { active: boolean }) {
  return (
    <div key={String(active)} className="flex min-h-full flex-col items-center pt-1 text-center">
      <div className="anim-pop" style={d(0)}>
        <Logo size={68} className="shadow-[0_10px_24px_-12px_rgb(120_60_20/0.8)]" />
      </div>
      <p className="anim-pop mt-2 text-[17px] font-extrabold tracking-tight text-[#3b2414] dark:text-[#f4e3cc]" style={d(60)}>
        DockIn
      </p>
      <h1 className="anim-pop font-display mt-3 text-[34px] leading-[1.08] font-extrabold tracking-tight text-[#3b2414] dark:text-[#f8ead6]" style={d(120)}>
        Let&apos;s dive into
        <br />
        <Marker>DockIn</Marker>
      </h1>
      <p className="anim-pop mt-3 max-w-[19rem] text-[14.5px] leading-snug text-[#7a5a43] dark:text-[#cdb59a]" style={d(180)}>
        Your all-in-one college companion for attendance, classes, tasks, friends and much more.
      </p>

      {/* A peek at the app: the attendance card, with the day's classes and dinner behind it. */}
      <div className="relative mt-6 h-[188px] w-full max-w-[19rem]">
        <div className="intro-card anim-pop absolute top-3 -left-1 w-[62%] -rotate-6 p-3 text-left" style={d(260)}>
          <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-wide text-[#d9533b] uppercase">
            <UtensilsCrossed size={12} /> Dinner
          </p>
          <p className="mt-1 text-[12.5px] leading-snug font-bold">Paneer butter masala · Jeera rice</p>
        </div>
        <div className="intro-card anim-pop absolute top-1 -right-1 w-[58%] rotate-6 p-3 text-left" style={d(320)}>
          <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-wide text-[#e5951a] uppercase">
            <CalendarDays size={12} /> Next class
          </p>
          <p className="mt-1 text-[12.5px] leading-snug font-bold">DBMS · N-108 · 10:15</p>
        </div>
        <div className="intro-card anim-pop anim-float absolute inset-x-6 bottom-0 flex items-center gap-3 p-3.5 text-left" style={d(400)}>
          <span className="relative grid size-16 shrink-0 place-items-center">
            <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="32" cy="32" r="26" fill="none" stroke="#efe0c4" strokeWidth="7" />
              <circle cx="32" cy="32" r="26" fill="none" stroke="url(#introRing)" strokeWidth="7" strokeLinecap="round" strokeDasharray="163" className="intro-ring" />
              <defs>
                <linearGradient id="introRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#4b9bf0" />
                  <stop offset="1" stopColor="#2f6fd6" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-[15px] font-extrabold">82%</span>
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-bold text-[#7a5a43]">Attendance</span>
            <span className="block text-[13.5px] leading-snug font-extrabold">You can miss 3 more classes</span>
          </span>
        </div>
      </div>

      <div className="mt-auto grid w-full max-w-[21rem] grid-cols-4 gap-2.5 pt-6 pb-2">
        {(
          [
            ["blue", <BarChart3 key="a" size={22} />, "Attendance"],
            ["amber", <CalendarDays key="t" size={22} />, "Timetable"],
            ["coral", <UtensilsCrossed key="c" size={22} />, "Cafeteria"],
            ["green", <Users key="f" size={22} />, "Friends"],
          ] as [Tint, ReactNode, string][]
        ).map(([tint, icon, label], n) => (
          <div key={label} className="anim-pop flex flex-col items-center gap-1.5" style={d(480 + n * 60)}>
            <Tile tint={tint} size={52}>
              {icon}
            </Tile>
            <span className="text-[11.5px] font-bold text-[#5a3c26] dark:text-[#e4cfb3]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideTwo({ active }: { active: boolean }) {
  return (
    <div key={String(active)} className="pt-1 pb-3">
      {/* spiral rings across the top, like the notebook */}
      <div className="mb-3 flex justify-between px-2" aria-hidden>
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="h-3.5 w-[7px] rounded-full bg-gradient-to-b from-[#d29a62] to-[#9c5a2c] shadow-sm" />
        ))}
      </div>
      <h1 className="anim-pop font-display text-center text-[30px] leading-[1.1] font-extrabold tracking-tight text-[#3b2414] dark:text-[#f8ead6]">
        Everything you need
        <br />
        in <Marker>one app</Marker>
      </h1>
      <p className="anim-pop mt-2 text-center text-[14px] text-[#7a5a43] dark:text-[#cdb59a]" style={d(60)}>
        A smarter and simpler college life.
      </p>
      <ul className="mt-5 space-y-2.5">
        {FEATURES.map((f, n) => {
          const [, , row] = TINT[f.tint];
          return (
            <li
              key={f.title}
              className="intro-row anim-pop flex items-center gap-3 rounded-2xl p-2.5 pr-3"
              style={{ ...d(120 + n * 70), "--row": row } as CSSProperties}
            >
              <Tile tint={f.tint}>{f.icon}</Tile>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold">{f.title}</span>
                <span className="block text-[12px] leading-snug text-[#7a5a43] dark:text-[#cdb59a]">{f.sub}</span>
              </span>
              <ChevronRight size={17} className="shrink-0 text-[#b08560]" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SlideThree({ active }: { active: boolean }) {
  return (
    <div key={String(active)} className="flex min-h-full flex-col items-center pt-1 pb-3 text-center">
      {/* A checklist ticking itself off, with the cap resting on it. */}
      <div className="relative mt-1 h-[176px] w-full max-w-[17rem]">
        <span className="anim-halo absolute inset-6 rounded-full bg-[#f7c27a]/40 blur-2xl" aria-hidden />
        <div className="intro-card anim-pop absolute inset-x-4 top-4 bottom-2 rotate-[-3deg] p-4 text-left" style={d(0)}>
          <div className="mb-2 flex justify-between px-1" aria-hidden>
            {Array.from({ length: 7 }, (_, n) => (
              <span key={n} className="-mt-6 h-4 w-[6px] rounded-full bg-gradient-to-b from-[#d29a62] to-[#9c5a2c]" />
            ))}
          </div>
          {["Attend DBMS lab", "Submit OS assignment", "Mess pass ready"].map((t, n) => (
            <p key={t} className="flex items-center gap-2.5 py-1.5 text-[13.5px] font-bold">
              <span className="intro-tick grid size-5 shrink-0 place-items-center rounded-md bg-[#209660] text-white" style={d(500 + n * 380)}>
                <Check size={13} strokeWidth={3.2} />
              </span>
              <span className="intro-strike" style={d(560 + n * 380)}>
                {t}
              </span>
            </p>
          ))}
        </div>
        <span className="anim-float absolute -top-1 right-1 grid size-12 place-items-center rounded-2xl bg-white shadow-lg" style={d(300)}>
          <GraduationCap size={24} className="text-[#8a4520]" />
        </span>
      </div>

      <h1 className="anim-pop font-display mt-5 text-[31px] leading-[1.08] font-extrabold tracking-tight text-[#3b2414] dark:text-[#f8ead6]" style={d(120)}>
        Stay organised,
        <br />
        <Marker>stay ahead</Marker>
      </h1>
      <ul className="mt-5 w-full space-y-2.5 text-left">
        {(
          [
            ["amber", <Zap key="z" size={20} />, "Save time", "All college essentials in one place"],
            ["blue", <TrendingUp key="t" size={20} />, "Plan your bunks", "Know exactly how many classes you can miss"],
            ["coral", <Timer key="m" size={20} />, "Never miss a deadline", "LMS assignments land in Tasks by themselves"],
            ["green", <Users key="u" size={20} />, "Stay connected", "With your friends and your college life"],
          ] as [Tint, ReactNode, string, string][]
        ).map(([tint, icon, title, sub], n) => (
          <li key={title} className="intro-row anim-pop flex items-center gap-3 rounded-2xl p-2.5" style={{ ...d(220 + n * 70), "--row": TINT[tint][2] } as CSSProperties}>
            <Tile tint={tint} size={40}>
              {icon}
            </Tile>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-extrabold">{title}</span>
              <span className="block text-[12px] leading-snug text-[#7a5a43] dark:text-[#cdb59a]">{sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
