"use client";

import { Pencil, Wallet } from "lucide-react";
import type { BudgetStatus } from "@/lib/money";
import { fmtMoney } from "@/lib/money";
import { useCountUp } from "./ui";

/**
 * The month at a glance: a notebook card with what's been spent, the budget it is
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
    <section className="notebook rings relative mx-5" aria-label="Month summary">
      <div className="relative px-5 pt-2 pb-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[14px] font-bold text-muted">{label}</p>
          {status && (
            <button
              onClick={onEditBudget}
              aria-label="Change budget"
              className="btn-paper lip-sm inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12px]"
            >
              <Pencil size={12} /> Budget
            </button>
          )}
        </div>

        <p className="font-display mt-1.5 text-[40px] leading-none font-extrabold tracking-[-0.04em] tnum">
          {fmtMoney(Math.round(shownSpent))}
          {status && <span className="text-[18px] font-bold text-muted"> / {fmtMoney(status.budget)}</span>}
        </p>

        {status ? (
          <div className="mt-4">
            <div className="groove h-2.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#a48cf2,#6a3de8)] transition-[width] duration-500"
                style={{ width: `${used * 100}%` }}
              />
            </div>
            <p className="mt-2.5 text-[13.5px] font-bold tnum">
              {status.left >= 0
                ? `${fmtMoney(status.left)} safe to spend`
                : `${fmtMoney(-status.left)} over budget`}
              {status.daysLeft > 0 && status.left >= 0 && status.perDay > 0 && (
                <span className="font-semibold text-muted"> · about {fmtMoney(Math.floor(status.perDay))}/day left</span>
              )}
            </p>
          </div>
        ) : (
          <button
            onClick={onSetBudget}
            className="btn-paper lip-sm mt-4 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px]"
          >
            <Wallet size={14} /> Set a monthly budget
          </button>
        )}
      </div>
    </section>
  );
}
