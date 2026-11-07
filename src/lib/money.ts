import type { Due, Expense, ExpenseCategory } from "./types";
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

/**
 * The same thing you buy all the time, ready to add again in one tap.
 *
 * Campus spending is the same handful of places and the same handful of
 * amounts: sixty rupees at the kathi roll place, twenty at the tuck shop. Typing
 * that in is the whole reason people give up on expense trackers, so the app
 * offers back what it has already seen — commonest first, and only pairs seen
 * more than once, because a one-off is not a habit.
 */
export function frequentSpends(
  expenses: Expense[],
  limit = 4,
): { category: ExpenseCategory; amount: number; times: number }[] {
  const tally = new Map<string, { category: ExpenseCategory; amount: number; times: number }>();
  for (const e of expenses) {
    if (e.deletedAt) continue;
    const key = `${e.category}|${e.amount}`;
    const row = tally.get(key);
    if (row) row.times += 1;
    else tally.set(key, { category: e.category, amount: e.amount, times: 1 });
  }
  return [...tally.values()]
    .filter((r) => r.times > 1)
    .sort((a, b) => b.times - a.times || b.amount - a.amount)
    .slice(0, limit);
}

/**
 * This month against the same point in the last one.
 *
 * Comparing a half-finished month with a whole one says nothing, so this counts
 * the previous month only up to the same day. Null when there is nothing to
 * compare against, because an invented baseline is worse than no comparison.
 */
export function pace(
  expenses: Expense[],
  month: string,
  today: string,
): { diff: number; lastMonth: number; upTo: number } | null {
  const day = month === monthKey(today) ? Number(today.slice(8, 10)) : daysInMonth(month);
  const prev = shiftMonth(month, -1);
  const prevList = expenses.filter(
    (e) => !e.deletedAt && monthKey(e.date) === prev && Number(e.date.slice(8, 10)) <= day,
  );
  if (prevList.length === 0) return null;
  const mine = sum(expenses.filter((e) => !e.deletedAt && monthKey(e.date) === month));
  const theirs = sum(prevList);
  return { diff: mine - theirs, lastMonth: theirs, upTo: day };
}

// ---------- udhaar ----------

/**
 * "Rahul", "rahul", "Rahul Kumar" and "RAHUL K" are one person here; "Rahul"
 * and "Rohit" are not: the same first name (three letters or more) is the same person.
 */
export function samePerson(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const fx = x.split(" ")[0];
  const fy = y.split(" ")[0];
  return fx === fy && fx.length >= 3;
}

/** Everything between you and one person that is still open. */
export interface PersonLedger {
  person: string;
  /** They owe you. */
  lena: number;
  /** You owe them. */
  dena: number;
  /** Positive: they owe you on balance. */
  net: number;
  open: Due[];
  /** Most recent entry, "YYYY-MM-DD". */
  last: string;
}

const left = (d: Due) => Math.max(0, Math.round((d.amount - d.paid) * 100) / 100);

/** Open udhaar, one row per person, the biggest balance first. */
export function ledger(dues: Due[]): PersonLedger[] {
  const out: PersonLedger[] = [];
  for (const d of dues) {
    if (d.deletedAt || d.settledAt || left(d) <= 0) continue;
    let row = out.find((r) => samePerson(r.person, d.person));
    if (!row) {
      row = { person: d.person, lena: 0, dena: 0, net: 0, open: [], last: d.date };
      out.push(row);
    }
    // The fuller spelling is the one to show.
    if (d.person.length > row.person.length) row.person = d.person;
    if (d.dir === "owed") row.lena += left(d);
    else row.dena += left(d);
    row.net = Math.round((row.lena - row.dena) * 100) / 100;
    row.open.push(d);
    if (d.date > row.last) row.last = d.date;
  }
  return out.sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.last.localeCompare(a.last));
}

export function ledgerTotals(rows: PersonLedger[]): { lena: number; dena: number } {
  let lena = 0;
  let dena = 0;
  for (const r of rows) {
    if (r.net > 0) lena += r.net;
    else dena += -r.net;
  }
  return { lena, dena };
}

/** The people you have had udhaar with, most recent first, for the name picker. */
export function knownPeople(dues: Due[], limit = 8): string[] {
  const out: string[] = [];
  for (const d of [...dues].sort((a, b) => b.date.localeCompare(a.date))) {
    if (!out.some((p) => samePerson(p, d.person))) out.push(d.person);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * A polite nudge, ready to send. With a UPI id it carries a pay link, so
 * settling up is one tap on their side too.
 */
export function reminderText(row: PersonLedger, upi?: string): string {
  const first = row.person.split(" ")[0];
  const items = row.open
    .filter((d) => d.dir === "owed")
    .slice(0, 3)
    .map((d) => (d.note ? `${d.note} ${fmtMoney(left(d))}` : fmtMoney(left(d))));
  const what = items.length ? ` (${items.join(", ")})` : "";
  let text = `Hey ${first}, ${fmtMoney(row.net)} pending from you${what}. Bhej dena jab time mile 🙏`;
  if (upi) text += `\nUPI: upi://pay?pa=${encodeURIComponent(upi)}&am=${row.net}&cu=INR`;
  return text;
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Splitting a bill: your share and each other person's, in whole rupees where possible. */
export function splitShares(amount: number, people: number): { mine: number; each: number } {
  const n = Math.max(1, Math.floor(people));
  const each = Math.round((amount / n) * 100) / 100;
  const mine = Math.round((amount - each * (n - 1)) * 100) / 100;
  return { mine, each };
}
