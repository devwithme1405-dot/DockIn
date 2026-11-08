/**
 * One timeline for every rupee.
 *
 * The Money screen keeps spending, money in, and lena-dena in three different
 * places, which is right for doing each of them — but a question like "how much
 * have I spent at Monginis?" or "everything between me and Rahul" cuts across
 * all three. History is that cross-cut: expenses, income and dues folded into a
 * single list you can search, filter, sort, and drill into by who or where.
 *
 * Everything here is pure. The screen hands in the three lists and gets back
 * rows; nothing reads the database or the clock, so it can be tested directly.
 */

import type { Due, Expense, Income } from "./types";
import { type CategoryMeta, metaFor, samePerson } from "./money";

/** spent = money out, in = money that came, lent = you lent (lena), borrowed = you owe (dena). */
export type HistKind = "spent" | "in" | "lent" | "borrowed";

export interface HistItem {
  id: string;
  kind: HistKind;
  amount: number;
  /** "YYYY-MM-DD". */
  date: string;
  /** Tiebreak within a day, so two entries on the same date keep their order. */
  at: number;
  /** The line that shows: a merchant, a person, or a note. */
  title: string;
  /** Second line: category, "paid back", etc. */
  sub: string;
  emoji: string;
  /** Who it was with or where it went — the key the drill-down groups on. Null when unknown. */
  party: string | null;
  /** "merchant" (a place) or "person" (lena-dena), for the drill-down heading. */
  partyKind: "merchant" | "person" | null;
  category: string | null;
  /** +1 money in, -1 money out — the cashflow lens each row shows. */
  sign: 1 | -1;
  /** Dues only: fully paid back. */
  settled: boolean;
  /** What is still open on a due (amount − paid), 0 when settled; the full amount otherwise. */
  outstanding: number;
}

/** Spends whose note is a real merchant name use it; otherwise the category is the place. */
function spentParty(e: Expense, label: string): string {
  const note = e.note?.trim();
  // A split note like "Monginis (split)" still groups under the shop.
  if (note) return note.replace(/\s*\(split\)\s*$/i, "").trim() || label;
  return label;
}

/** Every expense, income and due as one list of rows, newest first. */
export function buildHistory(
  expenses: Expense[],
  incomes: Income[],
  dues: Due[],
  cats: CategoryMeta[],
): HistItem[] {
  const out: HistItem[] = [];

  for (const e of expenses) {
    if (e.deletedAt) continue;
    const meta = metaFor(e.category, cats);
    const party = spentParty(e, meta.label);
    out.push({
      id: e.id,
      kind: "spent",
      amount: e.amount,
      date: e.date,
      at: e.createdAt,
      title: party,
      sub: meta.label === party ? "" : meta.label,
      emoji: meta.emoji,
      party,
      partyKind: "merchant",
      category: e.category,
      sign: -1,
      settled: false,
      outstanding: e.amount,
    });
  }

  for (const i of incomes) {
    if (i.deletedAt) continue;
    const who = i.from?.trim() || "";
    out.push({
      id: i.id,
      kind: "in",
      amount: i.amount,
      date: i.date,
      at: i.createdAt,
      title: who || i.note?.trim() || "Money in",
      sub: who ? i.note?.trim() || "" : "",
      emoji: "💰",
      // Money from home or a refund is not a debt, so it stays out of the
      // by-person balance — it would read as "Dad owes you" forever otherwise.
      party: null,
      partyKind: null,
      category: null,
      sign: 1,
      settled: false,
      outstanding: i.amount,
    });
  }

  for (const d of dues) {
    if (d.deletedAt) continue;
    const lent = d.dir === "owed";
    const settled = !!d.settledAt || d.paid >= d.amount - 0.005;
    out.push({
      id: d.id,
      kind: lent ? "lent" : "borrowed",
      amount: d.amount,
      date: d.date,
      at: d.createdAt,
      title: d.person,
      sub: d.note?.trim() || (lent ? "You lent" : "You borrowed"),
      emoji: lent ? "🫴" : "🤝",
      party: d.person,
      partyKind: "person",
      category: null,
      // Lending is cash out of your hand; borrowing is cash in. Settled ones net to zero
      // but still belong on the timeline, greyed out.
      sign: lent ? -1 : 1,
      settled,
      outstanding: settled ? 0 : Math.max(0, Math.round((d.amount - d.paid) * 100) / 100),
    });
  }

  return sortHistory(out, "new");
}

export type HistType = "all" | "spent" | "in" | "lenden";
export type HistSort = "new" | "old" | "high" | "low";

export interface HistFilter {
  /** Free text: merchant, person, note or category. */
  q: string;
  type: HistType;
  /** An expense category id, or "all". */
  category: string;
}

export const EMPTY_FILTER: HistFilter = { q: "", type: "all", category: "all" };

function matchesType(it: HistItem, type: HistType): boolean {
  if (type === "all") return true;
  if (type === "spent") return it.kind === "spent";
  if (type === "in") return it.kind === "in";
  return it.kind === "lent" || it.kind === "borrowed"; // lenden
}

export function filterHistory(items: HistItem[], f: HistFilter): HistItem[] {
  const q = f.q.trim().toLowerCase();
  return items.filter((it) => {
    if (!matchesType(it, f.type)) return false;
    if (f.category !== "all" && it.category !== f.category) return false;
    if (!q) return true;
    const hay = `${it.title} ${it.sub} ${it.category ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export function sortHistory(items: HistItem[], sort: HistSort): HistItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sort === "high") return b.amount - a.amount || cmpDate(b, a);
    if (sort === "low") return a.amount - b.amount || cmpDate(b, a);
    if (sort === "old") return cmpDate(a, b);
    return cmpDate(b, a); // new
  });
  return copy;
}

function cmpDate(a: HistItem, b: HistItem): number {
  return a.date.localeCompare(b.date) || a.at - b.at;
}

export interface PartyGroup {
  party: string;
  kind: "merchant" | "person";
  /**
   * Merchant: gross spent (same as `spent`). Person: the outstanding lena-dena
   * balance — positive means they owe you, negative means you owe them.
   */
  total: number;
  /** Total money out, for a merchant. */
  spent: number;
  count: number;
  last: string;
  items: HistItem[];
}

/**
 * Rolled up by who or where: every shop with its running spend, every person
 * with the balance still open between you. This is the "company level" cut —
 * tap a shop and see every rupee that went there, tap a person and see
 * everything you have lent and borrowed.
 */
export function byParty(items: HistItem[], kind: "merchant" | "person"): PartyGroup[] {
  const groups: PartyGroup[] = [];
  const same = (a: string, b: string) => (kind === "person" ? samePerson(a, b) : a.toLowerCase() === b.toLowerCase());
  for (const it of items) {
    if (!it.party || it.partyKind !== kind) continue;
    let g = groups.find((x) => same(x.party, it.party!));
    if (!g) {
      g = { party: it.party, kind, total: 0, spent: 0, count: 0, last: it.date, items: [] };
      groups.push(g);
    }
    // Keep the fuller spelling of a name as the heading.
    if (it.party.length > g.party.length) g.party = it.party;
    g.items.push(it);
    g.count += 1;
    if (it.sign < 0) g.spent += it.amount;
    if (kind === "person") {
      // Lending means they owe you (+), borrowing means you owe them (−); only
      // what is still open counts, so a paid-back loan nets to zero.
      if (it.kind === "lent") g.total += it.outstanding;
      else if (it.kind === "borrowed") g.total -= it.outstanding;
    } else {
      g.total = g.spent;
    }
    if (it.date > g.last) g.last = it.date;
  }
  for (const g of groups) g.items = sortHistory(g.items, "new");
  // Merchants: biggest spend first. People: biggest open balance first.
  return groups.sort((a, b) =>
    kind === "merchant" ? b.spent - a.spent || b.last.localeCompare(a.last) : Math.abs(b.total) - Math.abs(a.total) || b.last.localeCompare(a.last),
  );
}

export interface HistTotals {
  spent: number;
  in: number;
  count: number;
}

export function totals(items: HistItem[]): HistTotals {
  let spent = 0;
  let inc = 0;
  for (const it of items) {
    if (it.kind === "spent") spent += it.amount;
    else if (it.kind === "in") inc += it.amount;
  }
  return { spent, in: inc, count: items.length };
}
