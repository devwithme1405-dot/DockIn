import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDue, resetAll, settleDue, settleWith } from "@/lib/repo";
import { knownPeople, ledger, ledgerTotals, reminderText, samePerson, splitShares, whatsappUrl } from "@/lib/money";
import type { Due } from "@/lib/types";

const due = (person: string, amount: number, dir: Due["dir"], date = "2026-11-01", paid = 0, note = ""): Due => ({
  id: `${person}-${amount}-${date}-${dir}`,
  person,
  amount,
  dir,
  note,
  date,
  paid,
  settledAt: null,
  createdAt: 0,
  updatedAt: 0,
});

describe("who is who", () => {
  it("treats spellings of one name as one person", () => {
    expect(samePerson("Rahul", "rahul")).toBe(true);
    expect(samePerson("Rahul Kumar", "RAHUL K")).toBe(true);
    expect(samePerson("Rahul", "Rohit")).toBe(false);
    expect(samePerson("Al", "Al Pacino")).toBe(false); // too short to call it the same first name
  });
});

describe("the lena-dena ledger", () => {
  it("nets each person and lists the biggest balance first", () => {
    const rows = ledger([
      due("Rahul", 300, "owed"),
      due("rahul kumar", 200, "owed", "2026-11-03"),
      due("Rahul", 100, "owe"),
      due("Aman", 50, "owe"),
      due("Priya", 80, "owed", "2026-11-02", 80),
    ]);
    expect(rows.map((r) => r.person)).toEqual(["rahul kumar", "Aman"]);
    expect(rows[0]).toMatchObject({ lena: 500, dena: 100, net: 400, last: "2026-11-03" });
    expect(ledgerTotals(rows)).toEqual({ lena: 400, dena: 50 });
  });

  it("counts only what is still unpaid", () => {
    const rows = ledger([due("Rahul", 300, "owed", "2026-11-01", 120)]);
    expect(rows[0].lena).toBe(180);
  });

  it("offers recent names first and each person once", () => {
    expect(knownPeople([due("Aman", 1, "owe", "2026-10-01"), due("Rahul", 1, "owed", "2026-11-01"), due("rahul", 1, "owed", "2026-09-01")])).toEqual([
      "Rahul",
      "Aman",
    ]);
  });

  it("writes a reminder with what it was for, and a UPI link when there is one", () => {
    const [row] = ledger([due("Rahul Kumar", 250, "owed", "2026-11-01", 0, "Pizza")]);
    const text = reminderText(row, "sachin@okaxis");
    expect(text).toContain("Hey Rahul, ₹250 pending from you (Pizza ₹250)");
    expect(text).toContain("upi://pay?pa=sachin%40okaxis&am=250&cu=INR");
    expect(whatsappUrl("a b")).toBe("https://wa.me/?text=a%20b");
  });

  it("splits a bill so the shares add back up exactly", () => {
    expect(splitShares(100, 3)).toEqual({ mine: 33.34, each: 33.33 });
    expect(splitShares(300, 3)).toEqual({ mine: 100, each: 100 });
    expect(splitShares(250, 1)).toEqual({ mine: 250, each: 250 });
  });
});

describe("settling up", () => {
  beforeEach(async () => {
    await resetAll();
  });

  it("pays off the oldest first and part-pays the next", async () => {
    await addDue({ person: "Rahul", amount: 100, dir: "owed", date: "2026-11-01" });
    await addDue({ person: "Rahul", amount: 200, dir: "owed", date: "2026-11-02" });
    const leftOver = await settleWith("rahul", "owed", 150);
    expect(leftOver).toBe(0);
    const rows = (await db.dues.toArray()).sort((a, b) => a.date.localeCompare(b.date));
    expect(rows[0]).toMatchObject({ paid: 100 });
    expect(rows[0].settledAt).not.toBeNull();
    expect(rows[1]).toMatchObject({ paid: 50, settledAt: null });
  });

  it("hands back what is more than was owed", async () => {
    await addDue({ person: "Aman", amount: 60, dir: "owed", date: "2026-11-01" });
    expect(await settleWith("Aman", "owed", 100)).toBe(40);
  });

  it("never touches the other direction or another person", async () => {
    const mine = await addDue({ person: "Aman", amount: 60, dir: "owe", date: "2026-11-01" });
    await addDue({ person: "Rohit", amount: 60, dir: "owed", date: "2026-11-01" });
    expect(await settleWith("Aman", "owed", 60)).toBe(60);
    await settleDue(mine.id);
    expect((await db.dues.get(mine.id))?.paid).toBe(60);
  });
});
