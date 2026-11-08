"use client";

import { Pencil, Wallet } from "lucide-react";
import type { BudgetStatus } from "@/lib/money";
import { fmtMoney } from "@/lib/money";
import { useCountUp } from "./ui";

/**
 * The month at a glance: a violet card with what's been spent, the budget it is
 * measured against, and — in plain words next to the bar — how much is safe to
 * spend before it runs out. The state is always spelled out, never colour alone.
 */
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
  const used = status ? Math.min(status.used, 1) : 0;
  const shownSpent = useCountUp(spent);

  return (
    <section className="ink-card hero-sheen relative mx-5 overflow-hidden rounded-[22px]" aria-label="Month summary">
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-medium text-white/80">{label}</p>
          {status && (
            <button
              onClick={onEditBudget}
              aria-label="Change budget"
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-medium"
            >
              <Pencil size={12} /> Budget
            </button>
          )}
        </div>

        <p className="font-display mt-1.5 text-[34px] leading-none font-bold tnum">
          {fmtMoney(Math.round(shownSpent))}
          {status && <span className="text-[18px] font-semibold text-white/70"> / {fmtMoney(status.budget)}</span>}
        </p>

        {status ? (
          <div className="mt-4">
            <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-500"
                style={{ width: `${used * 100}%` }}
              />
            </div>
            <p className="mt-2.5 text-[13.5px] font-medium text-white/90 tnum">
              {status.left >= 0
                ? `${fmtMoney(status.left)} safe to spend`
                : `${fmtMoney(-status.left)} over budget`}
              {status.daysLeft > 0 && status.left >= 0 && status.perDay > 0 && (
                <span className="text-white/65"> · about {fmtMoney(Math.floor(status.perDay))}/day left</span>
              )}
            </p>
          </div>
        ) : (
          <button
            onClick={onSetBudget}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[13px] font-medium"
          >
            <Wallet size={14} /> Set a monthly budget
          </button>
        )}
      </div>
    </section>
  );
}
