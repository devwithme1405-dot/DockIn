import { describe, expect, it } from "vitest";
import {
  buildHistory,
  byParty,
  EMPTY_FILTER,
  filterHistory,
  sortHistory,
  totals,
  type HistItem,
} from "@/lib/history";
import type { CategoryMeta } from "@/lib/money";
import type { Due, Expense, Income } from "@/lib/types";

const cats: CategoryMeta[] = [
  { id: "monginis", label: "Monginis", emoji: "🍰" },
  { id: "dominos", label: "Dominos", emoji: "🍕" },
  { id: "cab", label: "Cab", emoji: "🚕" },
];

let seq = 0;
const expense = (date: string, amount: number, category: string, note = ""): Expense => ({
  id: `e${seq++}`,
  createdAt: seq,
  updatedAt: seq,
  amount,
  category,
  note,
  date,
});
const income = (date: string, amount: number, from = "", note = ""): Income => ({
  id: `i${seq++}`,
  createdAt: seq,
  updatedAt: seq,
  amount,
  from,
  note,
  date,
});
const due = (date: string, amount: number, person: string, dir: Due["dir"], paid = 0, settledAt: number | null = null): Due => ({
  id: `d${seq++}`,
  createdAt: seq,
  updatedAt: seq,
  person,
  amount,
  dir,
  note: "",
  date,
  paid,
  settledAt,
});

describe("buildHistory", () => {
  it("folds expenses, income and dues into one list, newest first", () => {
    const h = buildHistory(
      [expense("2026-11-01", 60, "monginis")],
      [income("2026-11-03", 500, "Dad")],
      [due("2026-11-02", 100, "Rahul", "owed")],
      cats,
    );
    expect(h.map((x) => x.kind)).toEqual(["in", "lent", "spent"]);
    expect(h[0].date).toBe("2026-11-03");
  });

  it("uses the note as the merchant when present, else the category", () => {
    const h = buildHistory(
      [expense("2026-11-01", 60, "monginis", ""), expense("2026-11-01", 90, "cab", "Uber to station")],
      [],
      [],
      cats,
    );
    const byId = Object.fromEntries(h.map((x) => [x.amount, x]));
    expect(byId[60].party).toBe("Monginis"); // fell back to category label
    expect(byId[90].party).toBe("Uber to station"); // merchant note wins
  });

  it("strips a (split) suffix so a split still groups under the shop", () => {
    const h = buildHistory([expense("2026-11-01", 30, "dominos", "Dominos (split)")], [], [], cats);
    expect(h[0].party).toBe("Dominos");
  });

  it("marks a fully paid due settled and signs lend/borrow opposite ways", () => {
    const h = buildHistory(
      [],
      [],
      [due("2026-11-01", 100, "A", "owed", 100), due("2026-11-01", 50, "B", "owe")],
      cats,
    );
    const lent = h.find((x) => x.kind === "lent")!;
    const borrowed = h.find((x) => x.kind === "borrowed")!;
    expect(lent.settled).toBe(true);
    expect(lent.sign).toBe(-1);
    expect(borrowed.sign).toBe(1);
  });

  it("skips soft-deleted rows", () => {
    const e = { ...expense("2026-11-01", 60, "monginis"), deletedAt: Date.now() };
    expect(buildHistory([e], [], [], cats)).toHaveLength(0);
  });
});

describe("filterHistory", () => {
  const h = buildHistory(
    [expense("2026-11-01", 60, "monginis"), expense("2026-11-02", 250, "dominos")],
    [income("2026-11-03", 500, "Dad")],
    [due("2026-11-04", 100, "Rahul", "owed")],
    cats,
  );

  it("passes everything through with the empty filter", () => {
    expect(filterHistory(h, EMPTY_FILTER)).toHaveLength(4);
  });

  it("filters by type", () => {
    expect(filterHistory(h, { ...EMPTY_FILTER, type: "spent" })).toHaveLength(2);
    expect(filterHistory(h, { ...EMPTY_FILTER, type: "in" })).toHaveLength(1);
    expect(filterHistory(h, { ...EMPTY_FILTER, type: "lenden" })).toHaveLength(1);
  });

  it("filters by category", () => {
    const r = filterHistory(h, { ...EMPTY_FILTER, category: "dominos" });
    expect(r).toHaveLength(1);
    expect(r[0].amount).toBe(250);
  });

  it("searches title, sub and category, case-insensitively", () => {
    expect(filterHistory(h, { ...EMPTY_FILTER, q: "rahul" })).toHaveLength(1);
    expect(filterHistory(h, { ...EMPTY_FILTER, q: "MONGIN" })).toHaveLength(1);
    expect(filterHistory(h, { ...EMPTY_FILTER, q: "dad" })).toHaveLength(1);
  });
});

describe("sortHistory", () => {
  const items: HistItem[] = buildHistory(
    [expense("2026-11-01", 60, "monginis"), expense("2026-11-05", 20, "dominos"), expense("2026-11-03", 250, "cab")],
    [],
    [],
    cats,
  );

  it("sorts high and low by amount", () => {
    expect(sortHistory(items, "high").map((x) => x.amount)).toEqual([250, 60, 20]);
    expect(sortHistory(items, "low").map((x) => x.amount)).toEqual([20, 60, 250]);
  });

  it("sorts new and old by date", () => {
    expect(sortHistory(items, "new").map((x) => x.date)).toEqual(["2026-11-05", "2026-11-03", "2026-11-01"]);
    expect(sortHistory(items, "old").map((x) => x.date)).toEqual(["2026-11-01", "2026-11-03", "2026-11-05"]);
  });
});

describe("byParty", () => {
  it("rolls merchants up by name and totals their spend, biggest first", () => {
    const h = buildHistory(
      [
        expense("2026-11-01", 60, "monginis"),
        expense("2026-11-04", 90, "monginis"),
        expense("2026-11-02", 250, "dominos"),
      ],
      [],
      [],
      cats,
    );
    const g = byParty(h, "merchant");
    expect(g.map((x) => x.party)).toEqual(["Dominos", "Monginis"]);
    expect(g.find((x) => x.party === "Monginis")!.spent).toBe(150);
    expect(g.find((x) => x.party === "Monginis")!.count).toBe(2);
  });

  it("rolls people up: lent they-owe-you (+) nets against borrowed you-owe (−)", () => {
    const h = buildHistory(
      [],
      [],
      [due("2026-11-01", 100, "Rahul", "owed"), due("2026-11-03", 40, "Rahul", "owe")],
      cats,
    );
    const g = byParty(h, "person");
    expect(g).toHaveLength(1);
    expect(g[0].total).toBe(60); // they owe 100, you owe 40 → +60 in your favour
  });

  it("drops a settled loan from the open balance", () => {
    const h = buildHistory([], [], [due("2026-11-01", 300, "Aman", "owed", 300)], cats);
    expect(byParty(h, "person")[0].total).toBe(0);
  });

  it("counts only the unpaid part of a partly-paid loan", () => {
    const h = buildHistory([], [], [due("2026-11-01", 100, "Aman", "owed", 30)], cats);
    expect(byParty(h, "person")[0].total).toBe(70);
  });

  it("keeps income out of the by-person balance", () => {
    const h = buildHistory([], [income("2026-11-01", 500, "Dad")], [], cats);
    expect(byParty(h, "person")).toHaveLength(0);
  });

  it("merges people across spellings of the same first name", () => {
    const h = buildHistory([], [], [due("2026-11-01", 50, "rahul", "owed"), due("2026-11-02", 30, "Rahul Kumar", "owed")], cats);
    const g = byParty(h, "person");
    expect(g).toHaveLength(1);
    expect(g[0].party).toBe("Rahul Kumar"); // fuller spelling kept
  });
});

describe("totals", () => {
  it("adds up spend and money in, ignoring dues", () => {
    const h = buildHistory(
      [expense("2026-11-01", 60, "monginis")],
      [income("2026-11-02", 500, "Dad")],
      [due("2026-11-03", 100, "Rahul", "owed")],
      cats,
    );
    expect(totals(h)).toEqual({ spent: 60, in: 500, count: 3 });
  });
});
