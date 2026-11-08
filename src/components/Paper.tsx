"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BookOpen } from "lucide-react";
import type { AttendanceState } from "@/lib/types";
import { cx, useCountUp } from "./ui";

/**
 * The notebook kit: the pieces every redesigned screen is built from. The
 * textures live in globals.css (`.notebook`, `.btn-leather`, `.btn-paper`,
 * `.leather`, `.groove`); these components put them together.
 */

/** A spiral-bound notebook card. `rings={false}` gives the same paper without the binding. */
export function Notebook({
  rings = true,
  className,
  children,
  label,
}: {
  rings?: boolean;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section aria-label={label} className={cx("notebook", rings && "rings", className)}>
      {children}
    </section>
  );
}

/** A heading on the page, with an optional link on the right. */
export function SectionTitle({
  children,
  href,
  link = "See all",
  className,
}: {
  children: ReactNode;
  href?: string;
  link?: string;
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex items-end justify-between gap-3 px-5", className)}>
      <h2 className="font-display text-[19px] leading-tight font-extrabold tracking-[-0.02em]">{children}</h2>
      {href && (
        <Link href={href} className="shrink-0 pb-0.5 text-[13.5px] font-bold text-accent">
          {link}
        </Link>
      )}
    </div>
  );
}

/** Leather pills for the selected option, raised paper for the rest. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  small,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
  label: string;
  className?: string;
  small?: boolean;
}) {
  return (
    <div role="tablist" aria-label={label} className={cx("flex gap-2.5", className)}>
      {options.map(([id, text]) => {
        const on = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(id)}
            className={cx(
              "min-w-0 flex-1 truncate rounded-full px-3",
              small ? "h-9 text-[13px]" : "h-11 text-[14.5px]",
              on ? "btn-leather" : "btn-paper",
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/** A round raised-paper button: back, bell, calendar. */
export function PaperIconButton({
  label,
  href,
  onClick,
  children,
  dot,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  /** A red dot in the corner: something is waiting. */
  dot?: boolean;
}) {
  const cls = "btn-paper relative grid size-11 shrink-0 place-items-center rounded-full text-text";
  const inner = (
    <>
      {children}
      {dot && (
        <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full border-[1.5px] border-card bg-danger" aria-hidden />
      )}
    </>
  );
  if (href)
    return (
      <Link href={href} aria-label={label} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** The purple outline book on a raised paper square — a subject. */
export function BookTile({ size = 44 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[14px] border-[1.5px] border-card-edge bg-card text-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_2px_0_var(--pbtn-lip)]"
      style={{ width: size, height: size }}
    >
      <BookOpen size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </span>
  );
}

/** "↑ +3%" — how the week moved the figure. */
export function TrendPill({ delta, className }: { delta: number; className?: string }) {
  const up = delta >= 0;
  return (
    <span
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full border px-2 text-[12px] font-extrabold tnum",
        up ? "border-safe/30 bg-safe-soft text-safe" : "border-danger/30 bg-danger-soft text-danger",
        className,
      )}
      aria-label={`${up ? "Up" : "Down"} ${Math.abs(delta)}% this week`}
    >
      {up ? <ArrowUp size={12} strokeWidth={3} /> : <ArrowDown size={12} strokeWidth={3} />}
      {up ? "+" : "−"}
      {Math.abs(delta)}%
    </span>
  );
}

const BAR: Record<AttendanceState, string> = {
  none: "linear-gradient(90deg, #a48cf2, #7c55ee)",
  safe: "linear-gradient(90deg, #a48cf2, #6a3de8)",
  warn: "linear-gradient(90deg, #f1c063, #c98213)",
  danger: "linear-gradient(90deg, #ef8a76, #c23b2b)",
};

/** A bar pressed into the paper, filled in purple ink (amber or red when it is not going well). */
export function InkBar({
  pct,
  target,
  state = "safe",
  className,
}: {
  pct: number | null;
  target?: number;
  state?: AttendanceState;
  className?: string;
}) {
  const w = Math.min(Math.max(pct ?? 0, 0), 100);
  return (
    <div className={cx("groove relative h-2.5 w-full overflow-hidden rounded-full", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${w}%`,
          backgroundImage: BAR[state],
          boxShadow: "inset 0 1px 0 rgb(255 255 255 / 35%)",
        }}
      />
      {target !== undefined && (
        <span className="absolute top-0 h-full w-[2px] bg-text/45" style={{ left: `${target}%` }} aria-hidden />
      )}
    </div>
  );
}

const RING: Record<AttendanceState, [string, string]> = {
  none: ["#b4a0f6", "#7c55ee"],
  safe: ["#a88cff", "#5f31e0"],
  warn: ["#f3c46a", "#c27a12"],
  danger: ["#f09180", "#bf3727"],
};

/** The overall figure as a ring of purple ink around a raised paper disc. */
export function InkRing({
  pct,
  state = "safe",
  size = 132,
  stroke = 13,
  target,
  children,
}: {
  pct: number | null;
  state?: AttendanceState;
  size?: number;
  stroke?: number;
  target?: number;
  children?: ReactNode;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const value = useCountUp(Math.min(Math.max(pct ?? 0, 0), 100), 900);
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const tick = target === undefined ? null : (target / 100) * 2 * Math.PI - Math.PI / 2;
  const [a, b] = RING[state];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
          <radialGradient id={`${id}d`} cx="0.4" cy="0.3" r="0.8">
            <stop offset="0" style={{ stopColor: "var(--pbtn-top)" }} />
            <stop offset="1" style={{ stopColor: "var(--pbtn-bottom)" }} />
          </radialGradient>
        </defs>
        {/* the groove */}
        <circle cx={mid} cy={mid} r={r} fill="none" style={{ stroke: "var(--groove)" }} strokeWidth={stroke} />
        <circle cx={mid} cy={mid + 1} r={r - stroke / 2 + 0.5} fill="none" style={{ stroke: "rgb(var(--shadow-ink) / 18%)" }} strokeWidth={1.5} />
        {/* the raised disc in the middle */}
        <circle cx={mid} cy={mid + 2} r={r - stroke / 2 - 5} style={{ fill: "rgb(var(--shadow-ink) / 14%)" }} />
        <circle cx={mid} cy={mid} r={r - stroke / 2 - 5} fill={`url(#${id}d)`} style={{ stroke: "var(--card-edge)" }} strokeWidth={1.25} />
        {/* the ink */}
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={`url(#${id}g)`}
          strokeWidth={stroke - 3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          transform={`rotate(-90 ${mid} ${mid})`}
          style={{ filter: "drop-shadow(0 1.5px 1.5px rgb(60 20 140 / 35%))" }}
        />
        {tick !== null && (
          <line
            x1={mid + (r - stroke / 2) * Math.cos(tick)}
            y1={mid + (r - stroke / 2) * Math.sin(tick)}
            x2={mid + (r + stroke / 2) * Math.cos(tick)}
            y2={mid + (r + stroke / 2) * Math.sin(tick)}
            style={{ stroke: "var(--text)" }}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.5}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** The DockIn mark: a purple mortarboard in 3D, with a gold tassel. */
export function Cap3D({ size = 36, className }: { size?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}t`} x1="0.2" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#bba4ff" />
          <stop offset="0.5" stopColor="#8b64f5" />
          <stop offset="1" stopColor="#6436e2" />
        </linearGradient>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4e26bb" />
          <stop offset="1" stopColor="#37188c" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3f1c9c" />
          <stop offset="0.42" stopColor="#7a50ef" />
          <stop offset="1" stopColor="#3a1890" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe08f" />
          <stop offset="1" stopColor="#d9901a" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="55.5" rx="19" ry="3.4" fill="#5a3214" opacity="0.2" />
      <path d="M17 28 V40 C17 46 24 49.5 32 49.5 C40 49.5 47 46 47 40 V28 Z" fill={`url(#${id}b)`} />
      <path
        d="M20.5 41.5 C22.5 45 27 46.6 32 46.6"
        stroke="#ffffff"
        strokeOpacity="0.3"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M5 24.5 L32 37 L59 24.5 V28 L32 40.5 L5 28 Z" fill={`url(#${id}e)`} />
      <path d="M32 11.5 L59 24.5 L32 37 L5 24.5 Z" fill={`url(#${id}t)`} />
      <path d="M32 11.5 L59 24.5 L55.5 26.2 L32 15 Z" fill="#ffffff" opacity="0.16" />
      <path
        d="M32 24.5 L50.5 29.6 V41"
        stroke={`url(#${id}g)`}
        strokeWidth="1.9"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="24.5" r="2.5" fill={`url(#${id}g)`} />
      <path d="M48 40.5 H53 L54.6 49.2 H46.4 Z" fill={`url(#${id}g)`} />
      <path d="M48.8 43 V48.6 M50.5 43 V48.8 M52.2 43 V48.6" stroke="#a96a0d" strokeWidth="0.7" opacity="0.55" />
    </svg>
  );
}

/** A fountain pen lying across the page. Decoration only. */
export function PenArt({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 172 40" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7457dc" />
          <stop offset="0.38" stopColor="#3d2494" />
          <stop offset="1" stopColor="#1d0f4d" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1bd" />
          <stop offset="0.5" stopColor="#e3aa3c" />
          <stop offset="1" stopColor="#9a6410" />
        </linearGradient>
        <linearGradient id={`${id}n`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffeab0" />
          <stop offset="1" stopColor="#c68619" />
        </linearGradient>
      </defs>
      <ellipse cx="90" cy="35.5" rx="72" ry="2.6" fill="#5a3214" opacity="0.16" />
      {/* cap and clip */}
      <rect x="4" y="9" width="60" height="20" rx="10" fill={`url(#${id}b)`} />
      <rect x="11" y="12" width="46" height="2.6" rx="1.3" fill="#ffffff" opacity="0.28" />
      <rect x="14" y="6.2" width="38" height="3.6" rx="1.8" fill={`url(#${id}g)`} />
      <circle cx="51" cy="8" r="2.4" fill={`url(#${id}g)`} />
      <rect x="58" y="9" width="7.5" height="20" fill={`url(#${id}g)`} />
      {/* barrel */}
      <path d="M65.5 10 H119 L125 12.2 V25.8 L119 28 H65.5 Z" fill={`url(#${id}b)`} />
      <rect x="69" y="12.6" width="46" height="2.4" rx="1.2" fill="#ffffff" opacity="0.24" />
      <rect x="119" y="10.6" width="3" height="16.8" fill={`url(#${id}g)`} opacity="0.9" />
      {/* grip */}
      <path d="M125 12.6 H135 L137.5 14.2 V23.8 L135 25.4 H125 Z" fill="#1b1232" />
      {/* nib */}
      <path d="M137.5 13 C147.5 14 158 16.6 168 19 C158 21.4 147.5 24 137.5 25 Z" fill={`url(#${id}n)`} />
      <path d="M142 19 H165" stroke="#8a5a10" strokeWidth="0.8" />
      <circle cx="146" cy="19" r="1.4" fill="#8a5a10" />
    </svg>
  );
}

/** A square checkbox drawn on paper; ticked, it fills with leather. */
export function PaperCheck({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid size-[22px] shrink-0 place-items-center rounded-[6px] border-[1.75px] transition",
        checked
          ? "border-ink-2 bg-ink text-on-ink shadow-[inset_0_1px_0_rgb(255_214_170/0.4)]"
          : "border-card-edge bg-card shadow-[inset_0_1px_2px_rgb(var(--shadow-ink)/0.18)]",
      )}
    >
      {checked && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </span>
  );
}
