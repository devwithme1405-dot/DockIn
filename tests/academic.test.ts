import { describe, expect, it } from "vitest";
import { holidayInfo, holidaysBetween, isWeekend, nextHolidayAfter, weekdayOfDate } from "@/lib/academic";

describe("academic calendar", () => {
  it("reads the weekday from the date string", () => {
    expect(weekdayOfDate("2026-11-08")).toBe(0); // Sunday
    expect(weekdayOfDate("2026-11-07")).toBe(6); // Saturday
    expect(weekdayOfDate("2026-11-09")).toBe(1); // Monday
  });

  it("treats Saturday and Sunday as holidays", () => {
    expect(isWeekend("2026-11-07")).toBe(true);
    expect(isWeekend("2026-11-08")).toBe(true);
    expect(isWeekend("2026-11-09")).toBe(false);
  });

  it("names festival holidays and weekends, nothing on a working day", () => {
    expect(holidayInfo("2026-11-06")).toEqual({ name: "Dhanteras", kind: "festival" });
    expect(holidayInfo("2026-11-07")).toEqual({ name: "Saturday", kind: "weekend" });
    expect(holidayInfo("2026-11-09")).toBeNull();
  });

  it("lists every holiday in a range in order", () => {
    // Fri 6th Dhanteras, Sat 7th, Sun 8th Diwali, then a working Monday.
    const got = holidaysBetween("2026-11-06", "2026-11-09").map((h) => h.date);
    expect(got).toEqual(["2026-11-06", "2026-11-07", "2026-11-08"]);
  });

  it("finds the next holiday after a date, never the date itself", () => {
    // 9 Nov is a working Monday → next is Sat 14th.
    expect(nextHolidayAfter("2026-11-09")?.date).toBe("2026-11-14");
    // From Dhanteras the next is the Saturday after it, not itself.
    expect(nextHolidayAfter("2026-11-06")?.date).toBe("2026-11-07");
  });
});
