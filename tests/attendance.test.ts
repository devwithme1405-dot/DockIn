import { describe, expect, it } from "vitest";
import {
  computeStreak,
  countCancelled,
  describe as describeSummary,
  fmtPct,
  summarize,
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
