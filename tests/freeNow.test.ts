import { describe, expect, it } from "vitest";
import { classesFor, freeNow } from "@/lib/freeNow";
import type { FriendStatsData } from "@/lib/friendStats";

const D = "2026-11-27";
const snap = (week?: FriendStatsData["week"], today?: FriendStatsData["today"]): FriendStatsData => ({ v: 1, at: 0, target: 75, week, today });
const me = { id: "me", s: snap({ [D]: [{ from: "09:25", to: "10:25", name: "DBMS ( P-LA-203 )" }, { from: "11:30", to: "12:30", name: "FSD" }] }) };
const riya = { id: "riya", s: snap({ [D]: [{ from: "09:25", to: "10:25", name: "DBMS ( P-LA-110 )" }, { from: "14:00", to: "15:00", name: "French" }] }) };
const old = { id: "old", s: snap(undefined, { date: "2026-11-20", classes: [{ from: "09:00", to: "10:00", name: "X" }] }) };
const legacy = { id: "legacy", s: snap(undefined, { date: D, classes: [{ from: "13:00", to: "14:00", name: "Maths" }] }) };

describe("Free now", () => {
  it("uses the two-week list, so a friend who hasn't opened DockIn today still shows", () => {
    expect(classesFor(riya.s, D)).toHaveLength(2);
    expect(classesFor(riya.s, "2026-11-28")).toEqual([]);
    expect(classesFor(legacy.s, D)).toHaveLength(1);
    expect(classesFor(old.s, D)).toBeNull();
  });

  it("who's in class, when they're free, and the class only they have", () => {
    const { rows, together } = freeNow([me, riya, old], D, 10 * 60);
    const r = rows.find((x) => x.p.id === "riya")!;
    expect(r.current?.name).toMatch(/DBMS/);
    expect(r.slots!.find((c) => c.name === "French")!.only).toBe(true);
    expect(r.slots!.find((c) => /DBMS/.test(c.name))!.only).toBe(false);
    expect(r.free[0]).toEqual([10 * 60 + 25, 14 * 60]);
    expect(rows.find((x) => x.p.id === "old")!.slots).toBeNull();
    // Everyone free together: 10:25–11:30, 12:30–14:00, 15:00–18:00
    expect(together).toEqual([[625, 690], [750, 840], [900, 1080]]);
  });
});
