import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The phone, pretended: an inbox the popup has written answers into.
const phone = vi.hoisted(() => ({ inbox: [] as Record<string, unknown>[], acked: [] as string[] }));
vi.mock("@/lib/native", () => ({
  isNativeApp: () => true,
  DockIn: {
    pending: async () => ({ notices: phone.inbox }),
    ack: async ({ ids }: { ids: string[] }) => {
      phone.acked.push(...ids);
      phone.inbox = phone.inbox.filter((n) => !ids.includes(n.id as string));
    },
  },
}));

import { db } from "@/lib/db";
import { resetAll } from "@/lib/repo";
import { applyPopupAnswers } from "@/lib/popup";

const SMS = "com.google.android.apps.messaging";
const GPAY = "com.google.android.apps.nbu.paisa.user";
const at = 1_794_200_000_000;

beforeEach(async () => {
  await resetAll();
  phone.inbox = [];
  phone.acked = [];
});

describe("answers from the payment popup", () => {
  it("files 'for someone' as money they owe you, once, and clears both copies", async () => {
    phone.inbox = [
      { id: "a", app: SMS, title: "VM-SLICEIT", body: "Successfully paid Rs.450.00 from slice credit card XX1284 to DOMINOS PIZZA on 09-Nov-26 via UPI.", at, answer: { who: "other", person: "Rohan" } },
      { id: "b", app: GPAY, title: "You paid ₹450.00", body: "to Domino's Pizza", at: at + 4000, answer: { who: "other", person: "Rohan" } },
    ];
    const said = await applyPopupAnswers();
    expect(said).toEqual(["Rohan owes you ₹450"]);
    const dues = (await db.dues.toArray()).filter((d) => !d.deletedAt);
    expect(dues).toHaveLength(1);
    expect(dues[0]).toMatchObject({ person: "Rohan", amount: 450, dir: "owed" });
    expect(phone.acked.sort()).toEqual(["a", "b"]);
    // Running again finds nothing to add.
    expect(await applyPopupAnswers()).toEqual([]);
    expect((await db.dues.toArray()).length).toBe(1);
  });

  it("files 'for me' as an expense in the chosen category and remembers the shop", async () => {
    phone.inbox = [{ id: "c", app: GPAY, title: "You paid ₹60.00", body: "to 24/7 Kathi", at, answer: { who: "me", category: "kathi-247" } }];
    await applyPopupAnswers();
    const ex = (await db.expenses.toArray()).filter((e) => !e.deletedAt);
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ amount: 60, category: "kathi-247", note: "24/7 Kathi" });
    expect((await db.merchants.toArray()).length).toBe(1);
  });

  it("leaves out what was called 'not a spend', and never touches unanswered payments", async () => {
    phone.inbox = [
      { id: "d", app: GPAY, title: "You paid ₹99.00", body: "to Netflix", at, answer: { who: "ignore" } },
      { id: "e", app: GPAY, title: "You paid ₹20.00", body: "to Tuck Shop", at: at + 600_000 },
    ];
    expect(await applyPopupAnswers()).toEqual([]);
    expect((await db.expenses.toArray()).length).toBe(0);
    expect(phone.acked).toEqual(["d"]);
    expect(phone.inbox.map((n) => n.id)).toEqual(["e"]);
  });
});
