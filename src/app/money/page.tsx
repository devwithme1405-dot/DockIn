"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "@/components/PageHeader";
import { MoneySkeleton } from "@/components/Skeleton";
import { ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { getProfile, saveProfile } from "@/lib/repo";
import { useExpenses } from "@/lib/hooks";
import {
  CATEGORY_BY_ID,
  budgetStatus,
  byCategory,
  dailyTotals,
  daysInMonth,
  fmtMoney,
  groupByDay,
  inMonth,
  monthKey,
  monthLabel,
  shiftMonth,
  sum,
  weekStart,
} from "@/lib/money";
import { relativeDayLabel, fmtDay, toDateStr } from "@/lib/dates";
import type { Expense } from "@/lib/types";
import { Button, Chip, EmptyState, Sheet, cx } from "@/components/ui";
import { CATEGORY_ICON, ExpenseForm } from "@/components/ExpenseForm";

export default function MoneyPage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const all = useExpenses();
  const today = toDateStr();
  const [month, setMonth] = useState(monthKey(today));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetText, setBudgetText] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  const list = useMemo(() => inMonth(all ?? [], month), [all, month]);
  const spent = sum(list);
  const cats = useMemo(() => byCategory(list), [list]);
  const daily = useMemo(() => dailyTotals(list, month), [list, month]);
  const isCurrent = month === monthKey(today);
  const budget = profile?.budget ?? 0;
  const status = budget > 0 ? budgetStatus(budget, spent, month, today) : null;

  const todaySpent = sum((all ?? []).filter((e) => e.date === today));
  const weekSpent = sum((all ?? []).filter((e) => e.date >= weekStart(today) && e.date <= today));
  const daysSoFar = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(month);
  const avg = spent / Math.max(daysSoFar, 1);

  const shown = catFilter === "all" ? list : list.filter((e) => e.category === catFilter);
  const groups = groupByDay(shown);

  if (!profile || !all)
    return (
      <>
        <PageHeader title="Money" subtitle="Track every rupee" />
        <div className="h-4" />
        <MoneySkeleton />
      </>
    );

  const barTone =
    status?.state === "danger" ? "bg-danger" : status?.state === "warn" ? "bg-warn" : "bg-safe";

  return (
    <>
      <PageHeader
        title="Money"
        subtitle="Track every rupee"
        right={
          <>
          <button
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="grid size-10 place-items-center rounded-full bg-surface shadow-[0_0_0_1px_var(--line)]"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[5.5rem] text-center text-[13px] font-medium">
            {monthLabel(month)}
          </span>
          <button
            aria-label="Next month"
            disabled={isCurrent}
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="grid size-10 place-items-center rounded-full bg-surface shadow-[0_0_0_1px_var(--line)] disabled:opacity-35"
          >
            <ChevronRight size={18} />
          </button>
                  </>
        }
      />
      <div className="h-4" />

      <section className="mx-5 rounded-3xl bg-hero p-5 text-hero-fg" aria-label="Month summary">
        <p className="text-[13px] font-medium text-hero-muted">
          {isCurrent ? "Spent this month" : `Spent in ${monthLabel(month)}`}
        </p>
        <p className="mt-1 text-[38px] font-semibold leading-none tracking-tight tabular-nums">
          {fmtMoney(spent)}
        </p>

        {status ? (
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className={cx("h-full rounded-full transition-all", barTone)}
                style={{ width: `${Math.min(status.used, 1) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[13px] text-hero-muted">
              <span className="tabular-nums">
                {status.left >= 0
                  ? `${fmtMoney(status.left)} left of ${fmtMoney(budget)}`
                  : `${fmtMoney(-status.left)} over ${fmtMoney(budget)}`}
              </span>
              <button
                onClick={() => {
                  setBudgetText(String(budget));
                  setBudgetOpen(true);
                }}
                aria-label="Change budget"
                className="inline-flex shrink-0 items-center gap-1 text-hero-fg/80"
              >
                <Pencil size={13} /> Budget
              </button>
            </div>
            {isCurrent && status.perDay > 0 && (
              <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-[13px]">
                You can spend about <b className="tabular-nums">{fmtMoney(Math.floor(status.perDay))}</b> a day for the next {status.daysLeft} {status.daysLeft === 1 ? "day" : "days"}.
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={() => {
              setBudgetText("");
              setBudgetOpen(true);
            }}
            className="mt-4 inline-flex h-9 items-center rounded-full bg-white/15 px-3.5 text-[13px] font-medium"
          >
            Set a monthly budget
          </button>
        )}
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2.5 px-5" aria-label="Quick numbers">
        <Stat label="Today" value={fmtMoney(todaySpent)} tint="bg-accent-soft" />
        <Stat label="This week" value={fmtMoney(weekSpent)} tint="bg-warn-soft" />
        <Stat label="Avg / day" value={fmtMoney(Math.round(avg))} tint="bg-violet-soft" />
      </section>

      {list.length > 0 && (
        <>
          <section className="mt-6 px-5" aria-label="Daily spending">
            <h2 className="mb-3 text-[17px] font-semibold">Daily spending</h2>
            <DailyBars values={daily} month={month} today={today} />
          </section>

          <section className="mt-6 px-5" aria-label="Where it went">
            <h2 className="mb-3 text-[17px] font-semibold">Where it went</h2>
            <div className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                {cats.map((c) => (
                  <span key={c.meta.id} style={{ width: `${c.pct}%`, background: c.meta.color }} />
                ))}
              </div>
              <ul className="mt-4 space-y-3">
                {cats.map((c) => {
                  const Icon = CATEGORY_ICON[c.meta.id];
                  return (
                    <li key={c.meta.id} className="flex items-center gap-3">
                      <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", c.meta.tint, c.meta.ink)}>
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{c.meta.label}</span>
                        <span className="text-xs text-muted tabular-nums">{Math.round(c.pct)}%</span>
                      </span>
                      <span className="text-[15px] font-semibold tabular-nums">{fmtMoney(c.total)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </>
      )}

      <section className="mt-6" aria-label="Transactions">
        <h2 className="mb-3 px-5 text-[17px] font-semibold">Transactions</h2>
        {list.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            <Chip active={catFilter === "all"} onClick={() => setCatFilter("all")}>All</Chip>
            {cats.map((c) => (
              <Chip key={c.meta.id} active={catFilter === c.meta.id} onClick={() => setCatFilter(c.meta.id)}>
                {c.meta.label}
              </Chip>
            ))}
          </div>
        )}
        {list.length === 0 ? (
          <EmptyState
            title={isCurrent ? "No expenses yet" : "Nothing spent this month"}
            body={isCurrent ? "Add your first expense, chai counts too." : undefined}
            action={isCurrent && <Button onClick={() => setAdding(true)}>Add expense</Button>}
          />
        ) : (
          <div className="space-y-4 px-5">
            {groups.map((g) => (
              <div key={g.date}>
                <div className="mb-1.5 flex items-baseline justify-between text-[13px] text-muted">
                  <span className="font-medium">
                    {relativeDayLabel(g.date, today)}
                    {relativeDayLabel(g.date, today) === fmtDay(g.date) ? "" : ` · ${fmtDay(g.date)}`}
                  </span>
                  <span className="tabular-nums">{fmtMoney(g.total)}</span>
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                  {g.items.map((e) => {
                    const meta = CATEGORY_BY_ID[e.category];
                    const Icon = CATEGORY_ICON[e.category];
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => setEditing(e)}
                          className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2"
                        >
                          <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", meta.tint, meta.ink)}>
                            <Icon size={19} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium">{e.note || meta.label}</span>
                            {e.note && <span className="block truncate text-xs text-muted">{meta.label}</span>}
                          </span>
                          <span className="shrink-0 text-[15px] font-semibold tabular-nums">{fmtMoney(e.amount)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        onClick={() => setAdding(true)}
        aria-label="Add expense"
        className="fixed right-[max(1.25rem,calc((100vw-28rem)/2+1.25rem))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-2xl bg-accent text-on-accent shadow-[0_10px_28px_-6px_rgba(31,95,214,0.65)] transition active:scale-95"
      >
        <Plus size={26} />
      </button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add expense">
        <ExpenseForm onDone={() => setAdding(false)} />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Edit expense">
        {editing && <ExpenseForm key={editing.id} expense={editing} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={budgetOpen} onClose={() => setBudgetOpen(false)} title="Monthly budget">
        <p className="mb-4 text-sm text-muted">
          DockIn shows how much you can spend each day to stay inside this.
        </p>
        <div className="flex items-baseline gap-2 rounded-2xl bg-surface-2 px-4 py-3">
          <span className="text-[26px] font-semibold text-muted">₹</span>
          <input
            inputMode="numeric"
            autoFocus
            value={budgetText}
            placeholder="5000"
            onChange={(e) => setBudgetText(e.target.value.replace(/\D/g, ""))}
            aria-label="Monthly budget"
            className="min-w-0 flex-1 bg-transparent text-[30px] font-semibold tabular-nums outline-none placeholder:text-muted/50"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[3000, 5000, 8000, 10000].map((b) => (
            <Chip key={b} onClick={() => setBudgetText(String(b))}>
              {fmtMoney(b)}
            </Chip>
          ))}
        </div>
        <div className="mt-5 flex gap-3">
          {budget > 0 && (
            <Button
              variant="secondary"
              onClick={async () => {
                await saveProfile({ budget: 0 });
                setBudgetOpen(false);
              }}
            >
              Remove
            </Button>
          )}
          <Button
            className="flex-1"
            disabled={!budgetText || Number(budgetText) <= 0}
            onClick={async () => {
              await saveProfile({ budget: Number(budgetText) });
              setBudgetOpen(false);
            }}
          >
            Save budget
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className={cx("min-w-0 rounded-2xl px-3 py-3", tint)}>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-[17px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DailyBars({ values, month, today }: { values: number[]; month: string; today: string }) {
  const max = Math.max(...values, 1);
  const isCurrent = month === monthKey(today);
  const todayIdx = isCurrent ? Number(today.slice(8, 10)) - 1 : -1;
  const peak = values.indexOf(Math.max(...values));
  return (
    <div className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
      <div className="flex h-24 items-end gap-[3px]" role="img" aria-label="Spending per day this month">
        {values.map((v, i) => (
          <span
            key={i}
            className={cx(
              "flex-1 rounded-t-[3px]",
              v === 0 ? "bg-surface-2" : i === todayIdx ? "bg-accent" : "bg-accent/45",
            )}
            style={{ height: v === 0 ? 3 : `${Math.max((v / max) * 100, 6)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted tabular-nums">
        <span>1</span>
        <span>{Math.ceil(values.length / 2)}</span>
        <span>{values.length}</span>
      </div>
      {values[peak] > 0 && (
        <p className="mt-2 text-xs text-muted">
          Highest: {fmtMoney(values[peak])} on day {peak + 1}
        </p>
      )}
    </div>
  );
}
