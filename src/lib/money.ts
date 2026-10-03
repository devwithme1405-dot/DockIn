import type { Expense, ExpenseCategory } from "./types";
import { addDays, fromDateStr, toDateStr, weekdayOf } from "./dates";

export interface CategoryMeta {
  id: ExpenseCategory;
  label: string;
  emoji: string;
}

/**
 * What a new phone starts with. These are the places on this campus rather than
 * abstractions like "Food", because "Monginis" is what you actually remember
 * spending on. Every one of them can be renamed, removed or added to.
 */
export const SEED_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: "tuck-shop", label: "Tuck Shop", emoji: "🏪" },
  { id: "kathi-247", label: "24/7 Kathi", emoji: "🌯" },
  { id: "monginis", label: "Monginis", emoji: "🍰" },
  { id: "dominos", label: "Dominos", emoji: "🍕" },
  { id: "subway", label: "Subway", emoji: "🥪" },
  { id: "greenox", label: "GreenOX", emoji: "🥗" },
  { id: "paid-mess", label: "Paid Mess", emoji: "🍛" },
  { id: "snapeats", label: "SnapEats", emoji: "🛵" },
  { id: "hoc", label: "HOC", emoji: "☕" },
  { id: "quench", label: "Quench", emoji: "🥤" },
  { id: "hotspot", label: "Hotspot", emoji: "🍟" },
  { id: "southern-stories", label: "Southern Stories", emoji: "🥘" },
  { id: "food-truck", label: "Food Truck", emoji: "🚚" },
  { id: "vending", label: "Vending Machine", emoji: "🥫" },
  { id: "cab", label: "Cab", emoji: "🚕" },
  { id: "other", label: "Other", emoji: "💸" },
];

/** An expense whose category has since been deleted still has to render. */
export function metaFor(id: ExpenseCategory, cats: CategoryMeta[]): CategoryMeta {
  return (
    cats.find((c) => c.id === id) ?? {
      id,
      label: id.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      emoji: "💸",
    }
  );
}

/** "₹1,250" or "₹1,250.50". */
export function fmtMoney(n: number): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

export const monthKey = (date: string) => date.slice(0, 7);

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export const sum = (list: Expense[]) => list.reduce((a, e) => a + e.amount, 0);

export function inMonth(list: Expense[], key: string): Expense[] {
  return list.filter((e) => monthKey(e.date) === key);
}

export interface CategoryTotal {
  meta: CategoryMeta;
  total: number;
  pct: number;
}

/**
 * Spending per category, biggest first.
 *
 * `top` exists because a breakdown with sixteen entries is a list, not a
 * picture: beyond a handful the rest is folded into one "Everything else" row
 * rather than given its own colour nobody can tell apart.
 */
export function byCategory(list: Expense[], cats: CategoryMeta[], top = 0): CategoryTotal[] {
  const total = sum(list);
  const map = new Map<ExpenseCategory, number>();
  for (const e of list) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  const rows = [...map.entries()]
    .map(([id, t]) => ({ meta: metaFor(id, cats), total: t, pct: total ? (t / total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);

  if (top <= 0 || rows.length <= top) return rows;
  const rest = rows.slice(top);
  const restTotal = rest.reduce((n, r) => n + r.total, 0);
  return [
    ...rows.slice(0, top),
    {
      meta: { id: "__rest", label: `${rest.length} more`, emoji: "…" },
      total: restTotal,
      pct: total ? (restTotal / total) * 100 : 0,
    },
  ];
}

export function dailyTotals(list: Expense[], key: string): number[] {
  const out = Array.from({ length: daysInMonth(key) }, () => 0);
  for (const e of list) {
    if (monthKey(e.date) === key) out[Number(e.date.slice(8, 10)) - 1] += e.amount;
  }
  return out;
}

export function groupByDay(list: Expense[]): { date: string; items: Expense[]; total: number }[] {
  const map = new Map<string, Expense[]>();
  for (const e of list) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items, total: sum(items) }));
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const wd = weekdayOf(date);
  return addDays(date, -((wd + 6) % 7));
}

export interface BudgetStatus {
  budget: number;
  spent: number;
  left: number;
  /** 0..1+ share of the budget used. */
  used: number;
  /** Safe amount per remaining day (including today), 0 when over budget. */
  perDay: number;
  daysLeft: number;
  state: "safe" | "warn" | "danger";
}

export function budgetStatus(budget: number, spent: number, key: string, today: string): BudgetStatus {
  const total = daysInMonth(key);
  const isCurrent = monthKey(today) === key;
  const daysLeft = isCurrent ? total - Number(today.slice(8, 10)) + 1 : 0;
  const left = budget - spent;
  const used = budget > 0 ? spent / budget : 0;
  // Compare spending pace with how far through the month we are.
  const elapsed = isCurrent ? Number(today.slice(8, 10)) / total : 1;
  const state = used >= 1 ? "danger" : used > elapsed + 0.1 || used >= 0.85 ? "warn" : "safe";
  return {
    budget,
    spent,
    left,
    used,
    perDay: left > 0 && daysLeft > 0 ? left / daysLeft : 0,
    daysLeft,
    state,
  };
}

export { toDateStr, fromDateStr };
