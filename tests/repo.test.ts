import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addSlot,
  addSubject,
  deleteSubject,
  ensureSessionsForDate,
  exportAll,
  getProfile,
  importAll,
  saveProfile,
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

describe("backup restore", () => {
  it("restores a backup exactly and rejects other files", async () => {
    await saveProfile({ name: "Sachin", target: 80, budget: 6000, onboarded: true });
    const sub = await addSubject({ name: "Data Structures", code: "DSA" });
    await addSlot({ subjectId: sub.id, weekday: 1, start: "09:25", end: "10:25", kind: "lecture" });
    await ensureSessionsForDate("2026-10-05");
    const backup = await exportAll();

    await resetAll();
    expect(await db.subjects.count()).toBe(0);

    const summary = await importAll(backup);
    expect(summary).toMatchObject({ subjects: 1, slots: 1, sessions: 1 });
    const p = await getProfile();
    expect(p).toMatchObject({ name: "Sachin", target: 80, budget: 6000, onboarded: true });
    expect(await db.subjects.count()).toBe(1);

    // restored rows count as freshly edited so they upload on the next sync
    const [row] = await db.subjects.toArray();
    expect(row.updatedAt).toBeGreaterThan(Date.now() - 5000);

    await expect(importAll("not json")).rejects.toThrow(/valid backup/);
    await expect(importAll(JSON.stringify({ app: "other" }))).rejects.toThrow(/DockIn backup/);
    expect(await db.subjects.count()).toBe(1); // a bad file changes nothing
  });
});
