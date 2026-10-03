import { describe, expect, it } from "vitest";
import { eventsOn, holidayLength, nextHoliday } from "@/lib/calendar";
import type { EventKind } from "@/lib/types";
import {
  computeStreak,
  countCancelled,
  countable,
  describe as describeSummary,
  fmtPct,
  ifYouMiss,
  summarize,
  weekForm,
  weeklyTrend,
  withBase,
} from "@/lib/attendance";
import type { SessionStatus } from "@/lib/types";

const mk = (status: SessionStatus, weight = 1) => ({ status, weight });
const many = (status: SessionStatus, n: number) =>
  Array.from({ length: n }, () => mk(status));

describe("summarize", () => {
  it("returns an empty state before anything is marked", () => {
    const s = summarize([mk("unmarked"), mk("cancelled")], 75);
    expect(s.state).toBe("none");
    expect(s.pct).toBeNull();
  });

  it("ignores cancelled, holiday and unmarked classes", () => {
    const s = summarize(
      [...many("present", 3), mk("cancelled"), mk("holiday"), mk("unmarked")],
      75,
    );
    expect(s.total).toBe(3);
    expect(s.pct).toBe(100);
  });

  it("computes how many classes can still be missed", () => {
    // 9 of 10 = 90%. Missing 2 more: 9/12 = 75% (ok). Missing 3: 9/13 = 69%.
    const s = summarize([...many("present", 9), ...many("absent", 1)], 75);
    expect(s.canMiss).toBe(2);
    expect(s.state).toBe("safe");
  });

  it("warns when only one class can be missed", () => {
    // 8 of 10 = 80%. Missing 1 more: 8/11 = 72.7% (below). So 0... use 12 of 15.
    // 12 / 0.75 - 15 = 1 -> exactly one class can be missed.
    const s = summarize([...many("present", 12), ...many("absent", 3)], 75);
    expect(s.canMiss).toBe(1);
    expect(s.state).toBe("warn");
  });

  it("stays exactly on the line at 75%", () => {
    const s = summarize([...many("present", 3), ...many("absent", 1)], 75);
    expect(s.pct).toBe(75);
    expect(s.canMiss).toBe(0);
    expect(s.state).toBe("warn");
  });

  it("computes how many classes must be attended to recover", () => {
    // 7 of 10 = 70%. Need (a+n)/(10+n) >= 0.75 -> n >= 2 (9/12 = 75%).
    const s = summarize([...many("present", 7), ...many("absent", 3)], 75);
    expect(s.state).toBe("danger");
    expect(s.mustAttend).toBe(2);
    const after = summarize(
      [...many("present", 9), ...many("absent", 3)],
      75,
    );
    expect(after.pct).toBe(75);
  });

  it("is safe with a comfortable margin", () => {
    const s = summarize([...many("present", 20)], 75);
    expect(s.state).toBe("safe");
    // 20 / 0.75 - 20 = 6.67 -> 6
    expect(s.canMiss).toBe(6);
  });

  it("respects class weight", () => {
    const s = summarize([mk("present", 4), mk("absent", 1)], 75);
    expect(s.attended).toBe(4);
    expect(s.total).toBe(5);
    expect(s.pct).toBe(80);
  });

  it("handles a 100% target", () => {
    const s = summarize([...many("present", 5), ...many("absent", 1)], 100);
    expect(s.state).toBe("danger");
    expect(s.mustAttend).toBe(Infinity);
  });
});

describe("formatting", () => {
  it("formats percentages", () => {
    expect(fmtPct(null)).toBe("--");
    expect(fmtPct(75)).toBe("75%");
    expect(fmtPct(66.666)).toBe("66.7%");
  });

  it("describes states in plain language", () => {
    expect(
      describeSummary(summarize([...many("present", 20)], 75)),
    ).toMatch(/Can miss 6 more classes/);
    expect(
      describeSummary(
        summarize([...many("present", 7), ...many("absent", 3)], 75),
      ),
    ).toBe("Attend the next 2 classes");
  });
});

describe("withBase", () => {
  it("adds classes attended before using the app", () => {
    // 18 of 22 before the app, then 1 present and 1 absent.
    const s = summarize(
      withBase([mk("present"), mk("absent")], { baseAttended: 18, baseTotal: 22 }),
      75,
    );
    expect(s.attended).toBe(19);
    expect(s.total).toBe(24);
  });

  it("ignores empty or invalid bases", () => {
    expect(withBase([mk("present")], undefined)).toHaveLength(1);
    expect(withBase([mk("present")], { baseAttended: 5, baseTotal: 0 })).toHaveLength(1);
    // attended is clamped to total
    const s = summarize(withBase([], { baseAttended: 30, baseTotal: 20 }), 75);
    expect(s.pct).toBe(100);
  });
});

const day = (date: string, ...status: SessionStatus[]) =>
  status.map((s) => ({ date, status: s, weight: 1 }));

describe("computeStreak", () => {
  it("counts consecutive fully marked class days", () => {
    const sessions = [
      ...day("2026-09-28", "present", "absent"),
      ...day("2026-09-29", "present"),
      ...day("2026-09-30", "present", "cancelled"),
    ];
    expect(computeStreak(sessions, "2026-10-01")).toBe(3);
  });

  it("breaks on a day with an unmarked class", () => {
    const sessions = [
      ...day("2026-09-28", "present"),
      ...day("2026-09-29", "unmarked", "present"),
      ...day("2026-09-30", "present"),
    ];
    expect(computeStreak(sessions, "2026-10-01")).toBe(1);
  });

  it("does not break because today is unfinished, and counts it once done", () => {
    const past = [...day("2026-09-30", "present")];
    expect(computeStreak([...past, ...day("2026-10-01", "unmarked")], "2026-10-01")).toBe(1);
    expect(computeStreak([...past, ...day("2026-10-01", "present")], "2026-10-01")).toBe(2);
  });

  it("skips days with only cancelled classes", () => {
    const sessions = [...day("2026-09-30", "cancelled"), ...day("2026-09-29", "present")];
    expect(computeStreak(sessions, "2026-10-01")).toBe(1);
  });
});

describe("weeklyTrend", () => {
  it("builds a cumulative percentage per week, starting from the base", () => {
    const trend = weeklyTrend(
      [
        ...day("2026-09-28", "present", "absent"), // Monday week 1: +1/2
        ...day("2026-10-05", "present", "present"), // Monday week 2: +2/2
      ],
      { baseAttended: 8, baseTotal: 10 },
    );
    expect(trend).toHaveLength(2);
    expect(trend[0].week).toBe("2026-09-28");
    expect(trend[0].pct).toBeCloseTo((9 / 12) * 100);
    expect(trend[1].pct).toBeCloseTo((11 / 14) * 100);
  });

  it("ignores cancelled and unmarked classes", () => {
    expect(weeklyTrend(day("2026-09-28", "cancelled", "unmarked"))).toEqual([]);
    expect(countCancelled(day("2026-09-28", "cancelled", "present"))).toBe(1);
  });
});

describe("the recent form strip", () => {
  const mk = (date: string, start: string, status: SessionStatus) => ({ date, start, status });

  it("shows only classes you answered, oldest first", async () => {
    const { recentForm } = await import("@/lib/attendance");
    const out = recentForm([
      mk("2026-10-02", "09:25", "absent"),
      mk("2026-10-01", "09:25", "present"),
      mk("2026-10-03", "09:25", "unmarked"),
      mk("2026-10-03", "11:35", "cancelled"),
      mk("2026-10-03", "13:45", "holiday"),
      mk("2026-10-01", "08:20", "present"),
    ]);
    expect(out.map((s) => `${s.date} ${s.start} ${s.status}`)).toEqual([
      "2026-10-01 08:20 present",
      "2026-10-01 09:25 present",
      "2026-10-02 09:25 absent",
    ]);
  });

  it("keeps the most recent few, not the first few", async () => {
    const { recentForm } = await import("@/lib/attendance");
    const many = Array.from({ length: 30 }, (_, i) =>
      mk(`2026-10-${String(i + 1).padStart(2, "0")}`, "09:25", "present"),
    );
    const out = recentForm(many, 5);
    expect(out).toHaveLength(5);
    expect(out[0].date).toBe("2026-10-26");
    expect(out[4].date).toBe("2026-10-30");
  });

  it("copes with nothing marked at all", async () => {
    const { recentForm } = await import("@/lib/attendance");
    expect(recentForm([])).toEqual([]);
    expect(recentForm([mk("2026-10-01", "09:25", "unmarked")])).toEqual([]);
  });
});

describe("what the academic calendar says about a day", () => {
  const ev = (id: string, kind: EventKind, date: string, endDate = date) => ({
    id,
    title: id,
    kind,
    date,
    endDate,
    note: "",
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  });

  it("finds a holiday that spans several days", () => {
    const list = [ev("Diwali", "holiday", "2026-11-08", "2026-11-12")];
    expect(eventsOn(list, "2026-11-10").holidays).toHaveLength(1);
    expect(eventsOn(list, "2026-11-08").holidays).toHaveLength(1);
    expect(eventsOn(list, "2026-11-12").holidays).toHaveLength(1);
    expect(eventsOn(list, "2026-11-13").holidays).toHaveLength(0);
    expect(holidayLength(list[0])).toBe(5);
  });

  it("keeps other kinds of event out of the holiday list", () => {
    const list = [ev("Mid-sem", "event", "2026-11-10")];
    expect(eventsOn(list, "2026-11-10").holidays).toHaveLength(0);
    expect(eventsOn(list, "2026-11-10").others).toHaveLength(1);
  });

  it("looks ahead to the next one, never behind", () => {
    const list = [
      ev("Holi", "holiday", "2026-03-04"),
      ev("Diwali", "holiday", "2026-11-08", "2026-11-12"),
    ];
    expect(nextHoliday(list, "2026-10-03")?.title).toBe("Diwali");
    expect(nextHoliday(list, "2026-11-20")).toBeNull();
  });
});

describe("what missing the next classes would do", () => {
  it("answers the question the record cannot", () => {
    // 36 of 40 is 90%; missing two more lands at 36/42
    const out = ifYouMiss(36, 40, 2);
    expect(out!.pct).toBeCloseTo(85.71, 1);
  });

  it("says nothing when there is nothing to go on", () => {
    expect(ifYouMiss(0, 0, 2)).toBeNull();
    expect(ifYouMiss(10, 10, 0)).toBeNull();
  });

  it("counts only the classes that can count against you", () => {
    expect(
      countable([
        { status: "unmarked" },
        { status: "present" },
        { status: "absent" },
        { status: "cancelled" },
        { status: "holiday" },
      ]),
    ).toBe(3);
  });
});

describe("the last seven days, as squares", () => {
  const s = (date: string, status: string) => ({ date, status }) as never;

  it("reads a week the way you lived it", () => {
    const week = weekForm(
      [
        s("2026-10-01", "present"),
        s("2026-10-01", "present"),
        s("2026-10-02", "absent"),
        s("2026-10-03", "present"),
        s("2026-10-03", "absent"),
        s("2026-10-04", "holiday"),
      ],
      "2026-10-04",
    );
    const by = Object.fromEntries(week.map((d) => [d.date, d.form]));
    expect(by["2026-10-01"]).toBe("all");
    expect(by["2026-10-02"]).toBe("missed");
    expect(by["2026-10-03"]).toBe("some");
    expect(by["2026-10-04"]).toBe("holiday");
    expect(by["2026-09-30"]).toBe("none");
    expect(week).toHaveLength(7);
  });

  it("ends on today, oldest first", () => {
    const week = weekForm([], "2026-10-04");
    expect(week[0].date).toBe("2026-09-28");
    expect(week[6].date).toBe("2026-10-04");
  });

  it("does not call a cancelled class a missed one", () => {
    const week = weekForm([s("2026-10-04", "cancelled")], "2026-10-04");
    expect(week[6].form).toBe("none");
  });
});
