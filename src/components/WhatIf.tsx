"use client";

import { useState } from "react";
import { ArrowRight, Calculator, Minus, Plus } from "lucide-react";
import { fmtPct } from "@/lib/attendance";
import { cx } from "@/components/ui";

/**
 * The bunk calculator, one line tall: "Skip − 2 + → 80.7%".
 * Tap the word to flip between Skip and Attend. Pure arithmetic on
 * attended/held: skip adds held classes, attend adds both.
 */
export function WhatIf({
  attended,
  total,
  target,
  className,
}: {
  attended: number;
  total: number;
  target: number;
  className?: string;
}) {
  const [mode, setMode] = useState<"skip" | "attend">("skip");
  const [n, setN] = useState(1);
  if (total <= 0) return null;

  const after = mode === "skip" ? (attended / (total + n)) * 100 : ((attended + n) / (total + n)) * 100;
  const ok = after + 1e-9 >= target;

  return (
    <div
      className={cx("flex items-center gap-2 rounded-xl border-[1.5px] border-dashed border-card-edge px-2.5 py-1.5", className)}
      aria-label="Bunk calculator"
    >
      <Calculator size={15} className="shrink-0 text-muted" />
      <button
        type="button"
        onClick={() => setMode((m) => (m === "skip" ? "attend" : "skip"))}
        className={cx(
          "rounded-full px-2 py-0.5 text-[12.5px] font-bold",
          mode === "skip" ? "bg-danger-soft text-danger" : "bg-safe-soft text-safe",
        )}
        aria-label={`Mode: ${mode}. Tap to switch`}
      >
        {mode === "skip" ? "Skip" : "Attend"}
      </button>
      <button
        type="button"
        aria-label="One fewer"
        onClick={() => setN((v) => Math.max(1, v - 1))}
        className="grid size-7 place-items-center rounded-full bg-surface-2 active:scale-95"
      >
        <Minus size={13} />
      </button>
      <span className="w-5 text-center text-[14px] font-extrabold tnum">{n}</span>
      <button
        type="button"
        aria-label="One more"
        onClick={() => setN((v) => Math.min(60, v + 1))}
        className="grid size-7 place-items-center rounded-full bg-surface-2 active:scale-95"
      >
        <Plus size={13} />
      </button>
      <ArrowRight size={13} className="ml-auto shrink-0 text-muted" />
      <span className={cx("text-[15px] font-extrabold tnum", ok ? "text-safe" : "text-danger")}>{fmtPct(after)}</span>
    </div>
  );
}
