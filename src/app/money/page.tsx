"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "@/components/PageHeader";
import { MoneySkeleton } from "@/components/Skeleton";
import { ArrowDownLeft, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { addExpense, deleteExpense, deleteIncome, getProfile, restoreIncome, saveProfile } from "@/lib/repo";
import { useCategories, useDues, useExpenses, useIncomes } from "@/lib/hooks";
import {
  metaFor,
  budgetStatus,
  frequentSpends,
  pace,
  byCategory,
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
import { Button, Chip, EmptyState, Sheet, cx, useToast } from "@/components/ui";
import { ExpenseForm } from "@/components/ExpenseForm";
import { MoneyHero } from "@/components/MoneyHero";
import { MoneyHistory } from "@/components/MoneyHistory";
import { DetectedTray } from "@/components/DetectedTray";
import { ReviewTray } from "@/components/ReviewTray";
import { PhoneSetupNudge } from "@/components/PhoneSetup";
import { UdhaarCard } from "@/components/Udhaar";
import { Notebook, Segmented } from "@/components/Paper";

export default function MoneyPage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const toast = useToast();
  const all = useExpenses();
  const incomes = useIncomes();
  const dues = useDues();
  const today = toDateStr();
  const [month, setMonth] = useState(monthKey(today));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetText, setBudgetText] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [view, setView] = useState<"overview" | "expenses" | "history">("overview");

  const list = useMemo(() => inMonth(all ?? [], month), [all, month]);
  const spent = sum(list);
  // Six is as many as a breakdown can show before it stops being readable; the
  // rest fold into one row rather than each getting a colour of its own.
  const catList = useCategories();
  const cats = useMemo(() => byCategory(list, catList ?? [], 6), [list, catList]);
  const allCats = useMemo(() => byCategory(list, catList ?? []), [list, catList]);
  const isCurrent = month === monthKey(today);
  const budget = profile?.budget ?? 0;
  const status = budget > 0 ? budgetStatus(budget, spent, month, today) : null;

  // Habits worth one tap, and whether this month is running hot.
  const repeats = useMemo(() => frequentSpends(all ?? []), [all]);
  const paceNow = useMemo(() => pace(all ?? [], month, today), [all, month, today]);

  async function repeat(category: string, amount: number, label: string) {
    const e = await addExpense({ amount, category, date: today });
    toast.show(`${fmtMoney(amount)} at ${label}`, () => void deleteExpense(e.id));
  }

  const todaySpent = sum((all ?? []).filter((e) => e.date === today));
  const weekSpent = sum((all ?? []).filter((e) => e.date >= weekStart(today) && e.date <= today));
  const daysSoFar = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(month);
  const avg = spent / Math.max(daysSoFar, 1);
  const cameIn = (incomes ?? []).filter((i) => monthKey(i.date) === month);
  const inTotal = cameIn.reduce((n, i) => n + i.amount, 0);

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

  return (
    <div className="page-wash stagger pb-24">
      <PageHeader
        title="Money"
        subtitle="Every rupee, in and out"
        right={
          view === "history" ? undefined : (
          <>
          <button
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="btn-paper lip-sm grid size-10 place-items-center rounded-full"
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
            className="btn-paper lip-sm grid size-10 place-items-center rounded-full disabled:opacity-35"
          >
            <ChevronRight size={18} />
          </button>
                  </>
          )
        }
      />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          ["overview", "Overview"],
          ["expenses", "Expenses"],
          ["history", "History"],
        ]}
        label="Money view"
        className="mx-5 mt-1 mb-7"
      />

      {view === "overview" && (
      <MoneyHero
        label={isCurrent ? "Spent this month" : `Spent in ${monthLabel(month)}`}
        spent={spent}
        status={status}
        onEditBudget={() => {
          setBudgetText(String(budget));
          setBudgetOpen(true);
        }}
        onSetBudget={() => {
          setBudgetText("");
          setBudgetOpen(true);
        }}
      />
      )}
      {isCurrent && view !== "history" && (
        <div className="mt-4 px-5">
          <button
            onClick={() => setAdding(true)}
            className="btn-leather flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15.5px]"
          >
            <Plus size={19} strokeWidth={2.75} /> Add Expense
          </button>
        </div>
      )}

      {view === "overview" && (
        <>
          <PhoneSetupNudge />
          <DetectedTray />
          <ReviewTray />
        </>
      )}

      {/* One surface, three numbers. Three different pastel panels made these
          look like three unrelated things; they are three views of the same
          spending, and the hero above is already carrying the colour. */}
      {view === "overview" && (
      <section
        className="mx-5 mt-4 grid grid-cols-3 divide-x divide-dashed divide-card-edge overflow-hidden rounded-2xl lift"
        aria-label="Quick numbers"
      >
        <Stat label="Today" value={fmtMoney(todaySpent)} />
        <Stat label="This week" value={fmtMoney(weekSpent)} />
        {inTotal > 0 ? (
          <Stat label="Came in" value={fmtMoney(inTotal)} tone="text-safe" />
        ) : (
          <Stat label="Avg / day" value={fmtMoney(Math.round(avg))} />
        )}
      </section>
      )}

      {view === "overview" && paceNow && (
        <p className="mx-5 mt-3 rounded-2xl bg-surface px-4 py-3 text-[13.5px] shadow-[0_0_0_1px_var(--line)]">
          {paceNow.diff === 0 ? (
            <>Exactly level with last month at this point.</>
          ) : (
            <>
              <b className={cx("tabular-nums", paceNow.diff > 0 ? "text-warn" : "text-safe")}>
                {fmtMoney(Math.abs(paceNow.diff))} {paceNow.diff > 0 ? "more" : "less"}
              </b>{" "}
              than last month by the {paceNow.upTo}
              {ordinal(paceNow.upTo)}, when you had spent {fmtMoney(paceNow.lastMonth)}.
            </>
          )}
        </p>
      )}

      {view === "overview" && <UdhaarCard />}

      {view === "overview" && repeats.length > 0 && isCurrent && (
        <section className="mt-4" aria-label="Add again">
          <h2 className="mb-2 px-5 text-[13px] font-semibold tracking-wide text-muted uppercase">
            Add again
          </h2>
          <div className="flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {repeats.map((r) => {
              const meta = metaFor(r.category, catList ?? []);
              return (
                <button
                  key={`${r.category}-${r.amount}`}
                  onClick={() => void repeat(r.category, r.amount, meta.label)}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-surface px-3.5 text-[14px] font-medium shadow-[0_0_0_1px_var(--line)] transition active:scale-95"
                >
                  <span className="text-[17px] leading-none">{meta.emoji}</span>
                  <span className="whitespace-nowrap">{meta.label}</span>
                  <span className="tabular-nums text-muted">{fmtMoney(r.amount)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {view === "history" && (
        <MoneyHistory
          expenses={all ?? []}
          incomes={incomes ?? []}
          dues={dues ?? []}
          cats={catList ?? []}
          today={today}
        />
      )}

      {view === "overview" && allCats.length >= 1 && (
        <section className="mt-7" aria-label="Where it went">
          <h2 className="mb-3 px-5 font-display text-[19px] font-extrabold tracking-[-0.02em]">Where it went</h2>
          <Notebook className="mx-5 px-4 pb-4">
            <div className="flex items-center gap-4">
              <Donut parts={cats.map((c, i) => ({ value: c.total, color: SLICE[i % SLICE.length] }))} total={spent} />
              <ul className="min-w-0 flex-1 space-y-2">
                {cats.map((c, i) => (
                  <li key={c.meta.id} className="flex items-center gap-2 text-[13px]">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: SLICE[i % SLICE.length] }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {c.meta.emoji} {c.meta.label}
                    </span>
                    <span className="shrink-0 font-extrabold tnum">{Math.round(c.pct)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </Notebook>
        </section>
      )}

      {view === "expenses" && (
      <section className="mt-6" aria-label="Transactions">
        <h2 className="mb-3 px-5 font-display text-[19px] font-extrabold tracking-[-0.02em]">Transactions</h2>
        {list.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            <Chip active={catFilter === "all"} onClick={() => setCatFilter("all")}>All</Chip>
            {allCats.map((c) => (
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
                <ul className="divide-y divide-line overflow-hidden rounded-2xl lift">
                  {g.items.map((e) => {
                    const meta = metaFor(e.category, catList ?? []);
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => setEditing(e)}
                          className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-[19px]">
                            {meta.emoji}
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
      )}

      {view === "overview" && cameIn.length > 0 && (
        <section className="mt-6 px-5" aria-label="Money in">
          <h2 className="mb-3 font-display text-[19px] font-extrabold">Money in</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl lift">
            {cameIn.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3.5 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-safe-soft text-safe">
                  <ArrowDownLeft size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{i.from || i.note || "Money in"}</span>
                  <span className="block text-xs text-muted">{fmtDay(i.date)}</span>
                </span>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-safe">+{fmtMoney(i.amount)}</span>
                <button
                  onClick={async () => {
                    await deleteIncome(i.id);
                    toast.show("Removed", () => void restoreIncome(i.id));
                  }}
                  aria-label="Remove"
                  className="grid size-8 shrink-0 place-items-center rounded-full text-muted"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}



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
    </div>
  );
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 px-3 py-3 text-center">
      <p className={cx("truncate font-display text-[19px] font-extrabold tabular-nums", tone)}>{value}</p>
      <p className="mt-0.5 text-[12px] text-muted">{label}</p>
    </div>
  );
}

/** Category colours for the donut: ink colours from the notebook, never a rainbow. */
const SLICE = ["#6a3de8", "#f2871f", "#2e8a47", "#8f4a22", "#47708a", "#b23a5b", "#c9a13a"];

/** Where the month's money went, as a ring of ink around the total. */
function Donut({ parts, total }: { parts: { value: number; color: string }[]; total: number }) {
  const size = 132;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sum = parts.reduce((n, p) => n + p.value, 0) || 1;
  const lens = parts.map((p) => (p.value / sum) * c);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((n, l) => n + l, 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: "var(--groove)" }} />
        {parts.map((p, i) => {
          const len = lens[i];
          const gap = parts.length > 1 ? 2 : 0;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-starts[i]}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-[19px] leading-none font-extrabold tnum">{fmtMoney(total)}</p>
          <p className="mt-1 text-[11px] font-bold text-muted">spent</p>
        </div>
      </div>
    </div>
  );
}

