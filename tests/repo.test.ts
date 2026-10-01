import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addSlot,
  addSubject,
  deleteSubject,
  ensureSessionsForDate,
  resetAll,
  seedSampleTimetable,
  setSessionStatus,
  uid,
} from "@/lib/repo";
import { addDays, fmtTime, toDateStr, weekdayOf } from "@/lib/dates";

beforeEach(async () => {
  await resetAll();
});

describe("sessions", () => {
  it("generates a class once per date and never duplicates", async () => {
    const sub = await addSubject({ name: "Data Structures", code: "DSA" });
    await addSlot({
      subjectId: sub.id,
      weekday: 1,
      start: "09:25",
      end: "10:25",
      kind: "lecture",
    });
    const monday = "2026-10-05"; // a Monday
    expect(weekdayOf(monday)).toBe(1);

    await ensureSessionsForDate(monday);
    await ensureSessionsForDate(monday);
    expect(await db.sessions.count()).toBe(1);

    const [s] = await db.sessions.toArray();
    expect(s.status).toBe("unmarked");
    await setSessionStatus(s.id, "present");

    // Re-running must not reset a marked class.
    await ensureSessionsForDate(monday);
    expect((await db.sessions.get(s.id))!.status).toBe("present");
  });

  it("only creates classes for that weekday", async () => {
    const sub = await addSubject({ name: "DBMS", code: "DBMS" });
    await addSlot({
      subjectId: sub.id,
      weekday: 4,
      start: "08:20",
      end: "10:25",
      kind: "practical",
    });
    await ensureSessionsForDate("2026-10-05"); // Monday
    expect(await db.sessions.count()).toBe(0);
    await ensureSessionsForDate("2026-10-08"); // Thursday
    expect(await db.sessions.count()).toBe(1);
  });

  it("skips slots of deleted subjects", async () => {
    const sub = await addSubject({ name: "MPCA", code: "MPCA" });
    await addSlot({
      subjectId: sub.id,
      weekday: 1,
      start: "15:55",
      end: "18:00",
      kind: "practical",
    });
    await deleteSubject(sub.id);
    await ensureSessionsForDate("2026-10-05");
    expect(await db.sessions.count()).toBe(0);
  });
});

describe("sample timetable", () => {
  it("seeds 5 subjects and 17 weekly classes", async () => {
    await seedSampleTimetable();
    expect(await db.subjects.count()).toBe(5);
    expect(await db.slots.count()).toBe(17);
  });
});

describe("helpers", () => {
  it("makes unique ids", () => {
    expect(uid()).not.toBe(uid());
    expect(uid()).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("does date maths in local time", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(toDateStr(new Date(2026, 9, 1))).toBe("2026-10-01");
    expect(fmtTime("09:25")).toBe("9:25 am");
    expect(fmtTime("13:45")).toBe("1:45 pm");
    expect(fmtTime("00:05")).toBe("12:05 am");
  });
});

describe("concurrent session generation", () => {
  it("does not throw when two callers generate the same day at once", async () => {
    const sub = await addSubject({ name: "Data Structures", code: "DSA" });
    await addSlot({ subjectId: sub.id, weekday: 1, start: "09:25", end: "10:25", kind: "lecture" });
    await Promise.all([ensureSessionsForDate("2026-10-05"), ensureSessionsForDate("2026-10-05"), ensureSessionsForDate("2026-10-05")]);
    expect(await db.sessions.where("date").equals("2026-10-05").count()).toBe(1);
  });
});
