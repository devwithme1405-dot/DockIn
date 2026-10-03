"use client";

import { Pencil, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { BudgetStatus } from "@/lib/money";
import { fmtMoney } from "@/lib/money";

/**
 * The month, as a glass filling up.
 *
 * Same idea as the sky on Today: the number alone is a fact, but the colour and
 * the water level tell you how you are doing before you have read anything. The
 * level is how much of the budget is gone, so a glass about to overflow means
 * exactly what it looks like.
 *
 * The state is always spelled out in words next to the colour, never by colour
 * alone — the whole point fails for anyone who cannot separate red from green.
 */

type Tone = "none" | "safe" | "warn" | "danger";

const SCENE: Record<Tone, { from: string; to: string; water: string; crest: string }> = {
  none: { from: "#1b2430", to: "#2b3747", water: "#4a5a70", crest: "#63748c" },
  safe: { from: "#0d3b33", to: "#13584a", water: "#1f8a6e", crest: "#35b18d" },
  warn: { from: "#432f0d", to: "#6b4a12", water: "#a9741a", crest: "#d19a2c" },
  danger: { from: "#431320", to: "#7a1f2e", water: "#b32f42", crest: "#e04f60" },
};

const WORDS: Record<Tone, string> = {
  none: "No budget set",
  safe: "On track",
  warn: "Going fast",
  danger: "Over budget",
};

export function MoneyHero({
  label,
  spent,
  status,
  onEditBudget,
  onSetBudget,
}: {
  label: string;
  spent: number;
  status: BudgetStatus | null;
  onEditBudget: () => void;
  onSetBudget: () => void;
}) {
  const tone: Tone = status ? status.state : "none";
  const scene = SCENE[tone];
  // With no budget there is nothing to be full of, so the glass sits low and calm.
  const level = status ? Math.min(status.used, 1.12) : 0.18;
  const Trend = tone === "danger" || tone === "warn" ? TrendingUp : TrendingDown;

  return (
    <section
      className="relative isolate mx-5 overflow-hidden rounded-[28px] text-white"
      style={{ background: `linear-gradient(160deg, ${scene.from}, ${scene.to})` }}
      aria-label="Month summary"
    >
      <Waves level={level} water={scene.water} crest={scene.crest} />

      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-white/70">{label}</p>
            <p className="mt-1 text-[38px] font-semibold leading-none tracking-tight tabular-nums">
              {fmtMoney(spent)}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[12px] font-medium backdrop-blur-sm">
            {tone === "none" ? <Wallet size={13} /> : <Trend size={13} />}
            {WORDS[tone]}
          </span>
        </div>

        {status ? (
          <div className="mt-6">
            <div className="h-2 overflow-hidden rounded-full bg-black/25">
              <div
                className="h-full rounded-full bg-white/85 transition-[width] duration-500"
                style={{ width: `${Math.min(status.used, 1) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[13px] text-white/75">
              <span className="tabular-nums">
                {status.left >= 0
                  ? `${fmtMoney(status.left)} left of ${fmtMoney(status.budget)}`
                  : `${fmtMoney(-status.left)} over ${fmtMoney(status.budget)}`}
              </span>
              <button
                onClick={onEditBudget}
                aria-label="Change budget"
                className="inline-flex shrink-0 items-center gap-1 text-white/85"
              >
                <Pencil size={13} /> Budget
              </button>
            </div>
            {status.daysLeft > 0 && (
              <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-[13px] backdrop-blur-sm">
                {status.perDay > 0 ? (
                  <>
                    About <b className="tabular-nums">{fmtMoney(Math.floor(status.perDay))}</b> a day for the
                    next {status.daysLeft} {status.daysLeft === 1 ? "day" : "days"}.
                  </>
                ) : (
                  <>
                    Nothing left for the last {status.daysLeft}{" "}
                    {status.daysLeft === 1 ? "day" : "days"} of the month.
                  </>
                )}
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={onSetBudget}
            className="mt-5 inline-flex h-9 items-center rounded-full bg-white/15 px-3.5 text-[13px] font-medium backdrop-blur-sm"
          >
            Set a monthly budget
          </button>
        )}
      </div>
    </section>
  );
}

/** Two offset waves, the back one slower, so the surface never looks pasted on. */
function Waves({ level, water, crest }: { level: number; water: string; crest: string }) {
  const top = Math.round((1 - Math.min(level, 1)) * 100);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 bottom-0 transition-[top] duration-700" style={{ top: `${top}%` }}>
        <svg
          className="absolute -top-[22px] left-0 h-[26px] w-[200%] money-wave money-wave-back"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
        >
          <path
            d="M0,30 C150,0 300,60 450,30 C600,0 750,60 900,30 C1050,0 1150,50 1200,34 L1200,60 L0,60 Z"
            fill={water}
            opacity="0.5"
          />
        </svg>
        <svg
          className="absolute -top-[14px] left-0 h-[22px] w-[200%] money-wave"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
        >
          <path
            d="M0,34 C150,60 300,4 450,32 C600,58 750,6 900,32 C1050,56 1150,14 1200,30 L1200,60 L0,60 Z"
            fill={crest}
            opacity="0.72"
          />
        </svg>
        <div className="absolute inset-0" style={{ background: water, opacity: 0.55 }} />
      </div>
    </div>
  );
}
