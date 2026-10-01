import type { Expense, ExpenseCategory } from "./types";
import { addDays, fromDateStr, toDateStr, weekdayOf } from "./dates";

export interface CategoryMeta {
  id: ExpenseCategory;
  label: string;
  /** Tailwind classes using theme tokens so light and dark both work. */
  tint: string;
  ink: string;
  /** Solid colour for charts. */
  color: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "food", label: "Food", tint: "bg-warn-soft", ink: "text-warn", color: "#d98a1f" },
  { id: "snacks", label: "Chai & Snacks", tint: "bg-rose-soft", ink: "text-rose", color: "#d9567f" },
  { id: "travel", label: "Travel", tint: "bg-accent-soft", ink: "text-accent", color: "#3b74e0" },
  { id: "shopping", label: "Shopping", tint: "bg-violet-soft", ink: "text-violet", color: "#8b63d6" },
  { id: "study", label: "Study", tint: "bg-safe-soft", ink: "text-safe", color: "#2a9d6f" },
  { id: "bills", label: "Bills & Recharge", tint: "bg-surface-2", ink: "text-muted", color: "#6b7a90" },
  { id: "fun", label: "Fun", tint: "bg-danger-soft", ink: "text-danger", color: "#e0645a" },
  { id: "other", label: "Other", tint: "bg-surface-2", ink: "text-muted", color: "#98a2b3" },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  ExpenseCategory,
  CategoryMeta
>;

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

export function byCategory(list: Expense[]): CategoryTotal[] {
  const total = sum(list);
  const map = new Map<ExpenseCategory, number>();
  for (const e of list) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  return [...map.entries()]
    .map(([id, t]) => ({ meta: CATEGORY_BY_ID[id], total: t, pct: total ? (t / total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

/** Total per day of the month, index 0 = day 1. */
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
