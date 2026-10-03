import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addExpense, deleteExpense, resetAll, restoreExpense, updateExpense } from "@/lib/repo";
import {
  budgetStatus,
  byCategory,
  SEED_CATEGORIES,
  dailyTotals,
  fmtMoney,
  groupByDay,
  inMonth,
  shiftMonth,
  sum,
  weekStart,
} from "@/lib/money";

beforeEach(async () => {
  await resetAll();
});

describe("expenses", () => {
  it("adds, edits, soft-deletes and restores", async () => {
    const e = await addExpense({ amount: 120.456, category: "food", note: "  Lunch ", date: "2026-10-01" });
    expect(e.amount).toBe(120.46);
    expect(e.note).toBe("Lunch");
    await updateExpense(e.id, { amount: 150, category: "snacks" });
    expect((await db.expenses.get(e.id))?.category).toBe("snacks");
    await deleteExpense(e.id);
    expect((await db.expenses.get(e.id))?.deletedAt).toBeTruthy();
    await restoreExpense(e.id);
    expect((await db.expenses.get(e.id))?.deletedAt).toBeNull();
  });
});

describe("money maths", () => {
  const mk = (amount: number, category: string, date: string) =>
    ({ id: date + amount, amount, category, note: "", date, createdAt: 0, updatedAt: 0 }) as const;
  const list = [mk(100, "food", "2026-10-01"), mk(50, "travel", "2026-10-01"), mk(200, "food", "2026-10-03"), mk(999, "food", "2026-09-30")];

  it("filters a month and sums", () => {
    expect(sum(inMonth([...list], "2026-10"))).toBe(350);
  });
  it("splits by category, biggest first", () => {
    const c = byCategory(inMonth([...list], "2026-10"), SEED_CATEGORIES);
    expect(c[0].meta.id).toBe("food");
    expect(Math.round(c[0].pct)).toBe(86);
    // a category that no longer exists still gets a readable name
    expect(c[0].meta.label).toBe("Food");
  });

  it("folds the tail into one row so a breakdown stays readable", () => {
    const many = Array.from({ length: 10 }, (_, i) => mk(100 - i, `place-${i}`, "2026-10-02"));
    const top = byCategory(many, SEED_CATEGORIES, 4);
    expect(top).toHaveLength(5);
    expect(top[4].meta.label).toBe("6 more");
    // nothing is lost in the fold
    expect(Math.round(top.reduce((n, r) => n + r.total, 0))).toBe(Math.round(sum(many)));
    expect(Math.round(top.reduce((n, r) => n + r.pct, 0))).toBe(100);
  });
  it("totals per day and groups newest first", () => {
    const d = dailyTotals([...list], "2026-10");
    expect(d).toHaveLength(31);
    expect(d[0]).toBe(150);
    expect(d[2]).toBe(200);
    expect(groupByDay(inMonth([...list], "2026-10"))[0].date).toBe("2026-10-03");
  });
  it("handles months and weeks", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sunday -> previous Monday
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
  });
  it("formats rupees", () => {
    expect(fmtMoney(1250)).toBe("₹1,250");
    expect(fmtMoney(1250.5)).toBe("₹1,250.50");
    expect(fmtMoney(123456)).toBe("₹1,23,456");
  });
  it("computes the daily budget left", () => {
    const b = budgetStatus(3100, 1000, "2026-10", "2026-10-11");
    expect(b.left).toBe(2100);
    expect(b.daysLeft).toBe(21);
    expect(b.perDay).toBe(100);
    expect(b.state).toBe("safe");
    expect(budgetStatus(1000, 1200, "2026-10", "2026-10-11").state).toBe("danger");
    expect(budgetStatus(1000, 1200, "2026-10", "2026-10-11").perDay).toBe(0);
  });
});

describe("avatars", () => {
  it("round-trips a choice and stays stable without one", async () => {
    const { formatAvatar, parseAvatar, PALETTES } = await import("@/lib/avatars");
    expect(formatAvatar({ kind: "emoji", emoji: "🦊", palette: 3 })).toBe("e:🦊:3");
    expect(parseAvatar("e:🦊:3", "Sachin")).toEqual({ kind: "emoji", emoji: "🦊", palette: 3 });
    expect(parseAvatar("i:2", "Sachin")).toEqual({ kind: "initial", emoji: null, palette: 2 });

    // no choice yet: same name always gets the same colour, and it is a real one
    const a = parseAvatar(undefined, "Sachin");
    expect(parseAvatar(undefined, "Sachin")).toEqual(a);
    expect(a.palette).toBeGreaterThanOrEqual(0);
    expect(a.palette).toBeLessThan(PALETTES.length);

    // junk never crashes the screen
    expect(parseAvatar("e:", "Sachin").kind).toBe("initial");
    expect(parseAvatar("e:🦊:999", "Sachin").palette).toBeLessThan(PALETTES.length);
    expect(parseAvatar("nonsense", "Sachin").kind).toBe("initial");
  });
});
