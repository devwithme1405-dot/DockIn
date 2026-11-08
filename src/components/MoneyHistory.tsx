"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpDown, Search, X } from "lucide-react";
import type { Due, Expense, Income } from "@/lib/types";
import {
  buildHistory,
  byParty,
  filterHistory,
  sortHistory,
  totals,
  type HistItem,
  type HistSort,
  type HistType,
  type PartyGroup,
} from "@/lib/history";
import { type CategoryMeta, fmtMoney } from "@/lib/money";
import { fmtDay, relativeDayLabel } from "@/lib/dates";
import { Chip, EmptyState, Sheet, cx } from "./ui";
import { Segmented } from "./Paper";

const TYPES: [HistType, string][] = [
  ["all", "All"],
  ["spent", "Spent"],
  ["in", "In"],
  ["lenden", "Lend & Borrow"],
];

const SORTS: [HistSort, string][] = [
  ["new", "Newest"],
  ["old", "Oldest"],
  ["high", "Biggest"],
  ["low", "Smallest"],
];

/**
 * The whole money story in one place: search it, narrow it, sort it, or roll it
 * up by shop or by person. "How much at Monginis?" and "everything with Rahul"
 * both live here, which the three separate Money tabs could never answer.
 */
export function MoneyHistory({
  expenses,
  incomes,
  dues,
  cats,
  today,
}: {
  expenses: Expense[];
  incomes: Income[];
  dues: Due[];
  cats: CategoryMeta[];
  today: string;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<HistType>("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<HistSort>("new");
  const [mode, setMode] = useState<"list" | "place" | "person">("list");
  const [open, setOpen] = useState<PartyGroup | null>(null);

  const all = useMemo(() => buildHistory(expenses, incomes, dues, cats), [expenses, incomes, dues, cats]);
  const filtered = useMemo(
    () => sortHistory(filterHistory(all, { q, type, category }), sort),
    [all, q, type, category, sort],
  );
  const sums = useMemo(() => totals(filtered), [filtered]);

  // Only categories that actually have spending, so the filter isn't a wall of chips.
  const spentCats = useMemo(() => {
    const ids = new Set(all.filter((h) => h.category).map((h) => h.category!));
    return cats.filter((c) => ids.has(c.id));
  }, [all, cats]);
  // The category filter only makes sense for spends.
  const showCats = (type === "all" || type === "spent") && spentCats.length > 1;

  if (all.length === 0) {
    return <EmptyState title="Nothing yet" body="Your spending, money in and lena-dena will all show up here." />;
  }

  return (
    <div className="px-5">
      {/* Search */}
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search shop, person, note…"
          aria-label="Search history"
          className="h-12 w-full rounded-xl border border-line bg-bg pr-10 pl-10 text-text outline-none placeholder:text-muted/70 focus:border-accent"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Type filter + sort */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TYPES.map(([t, label]) => (
          <Chip
            key={t}
            active={type === t}
            onClick={() => {
              setType(t);
              if (t !== "all" && t !== "spent") setCategory("all");
            }}
          >
            {label}
          </Chip>
        ))}
        <span className="ml-auto" />
        <button
          onClick={() => {
            const i = SORTS.findIndex(([s]) => s === sort);
            setSort(SORTS[(i + 1) % SORTS.length][0]);
          }}
          className="btn-paper lip-sm inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px]"
          aria-label={`Sort: ${SORTS.find(([s]) => s === sort)![1]}`}
        >
          <ArrowUpDown size={14} /> {SORTS.find(([s]) => s === sort)![1]}
        </button>
      </div>

      {/* Category filter — narrow to one place */}
      {showCats && (
        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All places
          </Chip>
          {spentCats.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              {c.emoji} {c.label}
            </Chip>
          ))}
        </div>
      )}

      {/* Totals for the current filter */}
      <div className="mt-3 flex gap-2">
        <Tally label="Spent" value={fmtMoney(sums.spent)} tone="text-danger" />
        <Tally label="Came in" value={fmtMoney(sums.in)} tone="text-safe" />
        <Tally label="Entries" value={String(sums.count)} />
      </div>

      {/* How to see it */}
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          ["list", "List"],
          ["place", "By place"],
          ["person", "By person"],
        ]}
        label="History view"
        className="mt-4"
      />

      {mode === "list" && <Timeline items={filtered} today={today} />}
      {mode === "place" && <Groups groups={byParty(filtered, "merchant")} onOpen={setOpen} empty="No spends to group." />}
      {mode === "person" && <Groups groups={byParty(filtered, "person")} onOpen={setOpen} empty="No lena-dena or named money yet." />}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? open.party : ""}>
        {open && (
          <>
            <div className="mb-3 flex gap-2">
              {open.kind === "merchant" ? (
                <Tally label="Total spent" value={fmtMoney(open.spent)} tone="text-danger" />
              ) : open.total === 0 ? (
                <Tally label="All settled" value="₹0" />
              ) : (
                <Tally
                  label={open.total > 0 ? "Owes you" : "You owe"}
                  value={fmtMoney(Math.abs(open.total))}
                  tone={open.total > 0 ? "text-safe" : "text-danger"}
                />
              )}
              <Tally label="Entries" value={String(open.count)} />
            </div>
            <Timeline items={open.items} today={today} flat />
          </>
        )}
      </Sheet>
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-surface px-3 py-2.5 text-center shadow-[0_0_0_1px_var(--line)]">
      <p className={cx("truncate font-display text-[17px] font-extrabold tabular-nums", tone)}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
    </div>
  );
}

/** The flat timeline, grouped by day unless a drill-down asks for it raw. */
function Timeline({ items, today, flat }: { items: HistItem[]; today: string; flat?: boolean }) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-[14px] text-muted">Nothing matches.</p>;
  }
  if (flat) {
    return (
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl lift">
        {items.map((it) => (
          <Row key={it.id} it={it} />
        ))}
      </ul>
    );
  }
  // Group by day, keeping the sorted order of the first item in each day.
  const days: { date: string; items: HistItem[] }[] = [];
  for (const it of items) {
    const last = days[days.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else days.push({ date: it.date, items: [it] });
  }
  return (
    <div className="mt-3 space-y-4">
      {days.map((d) => (
        <div key={d.date}>
          <p className="mb-1.5 px-0.5 text-[13px] font-medium text-muted">
            {relativeDayLabel(d.date, today)}
            {relativeDayLabel(d.date, today) === fmtDay(d.date) ? "" : ` · ${fmtDay(d.date)}`}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl lift">
            {d.items.map((it) => (
              <Row key={it.id} it={it} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Row({ it }: { it: HistItem }) {
  const inflow = it.sign > 0;
  return (
    <li className={cx("flex items-center gap-3 px-3.5 py-3", it.settled && "opacity-55")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-[19px]">{it.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{it.title}</span>
        {(it.sub || it.settled) && (
          <span className="block truncate text-xs text-muted">
            {it.settled ? "Settled" : it.sub}
            {it.kind === "lent" && !it.settled ? " · owes you" : ""}
            {it.kind === "borrowed" && !it.settled ? " · you owe" : ""}
          </span>
        )}
      </span>
      <span className={cx("shrink-0 text-[15px] font-semibold tabular-nums", inflow ? "text-safe" : "text-text")}>
        {inflow && <ArrowDownLeft size={13} className="mr-0.5 inline -translate-y-px" />}
        {inflow ? "+" : "−"}
        {fmtMoney(it.amount).replace("₹", "₹")}
      </span>
    </li>
  );
}

function Groups({ groups, onOpen, empty }: { groups: PartyGroup[]; onOpen: (g: PartyGroup) => void; empty: string }) {
  if (groups.length === 0) return <p className="py-10 text-center text-[14px] text-muted">{empty}</p>;
  return (
    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl lift">
      {groups.map((g) => (
        <li key={g.party}>
          <button onClick={() => onOpen(g)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{g.party}</span>
              <span className="block text-xs text-muted">
                {g.count} {g.count === 1 ? "entry" : "entries"} · last {fmtDay(g.last)}
              </span>
            </span>
            {g.kind === "merchant" ? (
              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-text">{fmtMoney(g.spent)}</span>
            ) : g.total === 0 ? (
              <span className="shrink-0 text-[13px] font-medium text-muted">Settled</span>
            ) : (
              <span
                className={cx("shrink-0 text-[15px] font-semibold tabular-nums", g.total > 0 ? "text-safe" : "text-danger")}
              >
                {g.total > 0 ? "+" : "−"}
                {fmtMoney(Math.abs(g.total))}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
