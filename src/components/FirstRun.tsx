"use client";

import "@fontsource/kalam/latin-700.css";
import type { ReactNode } from "react";
import { ArrowLeft, BarChart3, BookOpen, CalendarDays, UtensilsCrossed, Users } from "lucide-react";
import { cx } from "./ui";

/**
 * The top of every first-run screen after the welcome slides: a leather band
 * with the step, a handwritten heading and a few app icons drifting behind it.
 * The screen's card sits over its lower edge.
 */
export function HeroBand({
  step,
  of,
  onBack,
  title,
  sub,
  children,
}: {
  step?: number;
  of?: number;
  onBack?: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="hero-band relative overflow-hidden rounded-b-[36px] px-5 pt-[max(0.75rem,calc(var(--sat)+0.5rem))] pb-14 text-[#fff4e6]">
      {/* drifting icons */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {[
          [BarChart3, "8%", "38%", "0s", 30],
          [CalendarDays, "84%", "30%", "1.2s", 26],
          [UtensilsCrossed, "76%", "72%", "0.6s", 24],
          [BookOpen, "14%", "76%", "1.8s", 26],
          [Users, "90%", "58%", "2.4s", 20],
        ].map(([Icon, x, y, delay, size], n) => {
          const I = Icon as typeof BarChart3;
          return (
            <span key={n} className="hero-drift absolute text-white/[0.13]" style={{ left: x as string, top: y as string, animationDelay: delay as string }}>
              <I size={size as number} strokeWidth={2} />
            </span>
          );
        })}
      </span>

      <div className="relative flex items-center gap-3">
        {onBack ? (
          <button onClick={onBack} aria-label="Back" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 active:bg-white/25">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <span className="size-10" />
        )}
        {step && of ? (
          <>
            <div className="flex flex-1 gap-1.5" aria-label={`Step ${step} of ${of}`}>
              {Array.from({ length: of }, (_, n) => (
                <span key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                  <span className={cx("block h-full origin-left rounded-full bg-[#ffd7a8] transition-transform duration-500 ease-out", n < step ? "scale-x-100" : "scale-x-0")} />
                </span>
              ))}
            </div>
            <span className="w-10 text-right text-[12.5px] font-bold text-white/75">
              {step}/{of}
            </span>
          </>
        ) : (
          <span className="flex-1" />
        )}
      </div>

      <div className="relative mt-5 text-center">
        {children}
        <h1 className="font-script anim-pop text-[34px] leading-[1.05] text-white [text-shadow:0_2px_0_rgb(70_25_5/0.35)]">{title}</h1>
        {sub && (
          <p className="anim-pop mx-auto mt-1.5 max-w-[19rem] text-[14px] leading-snug text-[#ffe6cc]" style={{ "--d": "60ms" } as React.CSSProperties}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/** The brown cap tile from the welcome screen, smaller. */
export function CapTile({ size = 56 }: { size?: number }) {
  return (
    <span
      className="anim-pop mx-auto mb-2 grid place-items-center rounded-[18px] bg-[#fff4e6] text-[#8a4520] shadow-[0_4px_0_rgb(60_20_5/0.35),0_12px_20px_-10px_rgb(40_10_0/0.6)]"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M22 10 12 5 2 10l10 5 10-5Z" />
        <path d="M6 12v5c3 2.5 9 2.5 12 0v-5" />
        <path d="M22 10v6" />
      </svg>
    </span>
  );
}
