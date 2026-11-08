import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetAll } from "@/lib/repo";
import {
  camuSummary,
  camuView,
  classesOn,
  cleanCode,
  cleanName,
  holidayLastDay,
  holidayOn,
  importLms,
  labStarts,
  lmsTask,
  lmsTaskId,
  nextClass,
  resetImportMemo,
  subjectOf,
} from "@/lib/college";
import type { CamuPeriod, CamuState, LmsItem } from "@/lib/native";

// Shaped exactly like what the phone stores after reading Camu (College.java),
// with values like the ones Camu really returned.
const period = (date: string, from: string, to: string, name: string, code: string, subId: string, room = "P-LA-203"): CamuPeriod => ({
  date,
  from,
  to,
  name,
  code,
  subId,
  room,
  teacher: "Divya Singh",
  kind: "LECTURE",
  status: "A",
});

const CAMU: CamuState = {
  connected: true,
  syncedAt: 1_794_000_000_000,
  overall: { pct: 72, present: 176, total: 245 },
  subjects: [
    { id: "s-dbms", code: "2025CSET200", name: "Database Management Systems", present: 31, total: 43, absent: 12, leave: 0, duty: 0, pct: 72.09 },
    { id: "s-fsd", code: "2025CSET218", name: "Full Stack Development", present: 40, total: 44, absent: 4, leave: 0, duty: 0, pct: 90.9 },
  ],
  periods: [
    period("2026-11-04", "09:25", "10:25", "Database Management Systems ( P-LA-203 )", "CSET200", "s-dbms"),
    period("2026-11-04", "08:20", "09:20", "Full Stack Development ( P-CC-315 )", "CSET218", "other-id", "P-CC-315"),
    period("2026-11-05", "08:20", "09:20", "Database Management Systems ( P-LA-203 )", "CSET200", "s-dbms"),
    period("2026-11-05", "08:20", "09:20", "Database Management Systems ( P-LA-203 )", "CSET200", "s-dbms"),
  ],
  holidays: [{ title: "Diwali Holidays", start: "2026-11-06", end: "2026-11-11" }],
  history: {
    "s-dbms": [
      { date: "2026-11-04", from: "09:25", to: "10:25", present: true, leave: "" },
      { date: "2026-11-05", from: "08:20", to: "09:20", present: false, leave: "Leave" },
    ],
  },
};

describe("Camu's names", () => {
  it("drops the room Camu glues onto a subject name", () => {
    expect(cleanName("Database Management Systems ( P-LA-203 )")).toBe("Database Management Systems");
    expect(cleanName("Full Stack Development")).toBe("Full Stack Development");
    expect(cleanName("Database Management Systems ( ")).toBe("Database Management Systems");
  });

  it("drops the year Camu prefixes to a subject code", () => {
    expect(cleanCode("2025CSET200")).toBe("CSET200");
    expect(cleanCode("CSET200")).toBe("CSET200");
  });

  it("finds a period's subject by id, then by code, then by name", () => {
    const subs = CAMU.subjects!;
    expect(subjectOf({ subId: "s-dbms", code: "", name: "" }, subs)?.id).toBe("s-dbms");
    expect(subjectOf({ subId: "other-id", code: "CSET218", name: "" }, subs)?.id).toBe("s-fsd");
    expect(subjectOf({ subId: "x", code: "", name: "Full Stack Development ( P-CC-315 )" }, subs)?.id).toBe("s-fsd");
    expect(subjectOf({ subId: "x", code: "MATH101", name: "Maths" }, subs)).toBeUndefined();
  });
});

describe("the day's classes", () => {
  it("lists a published day in order, once each", () => {
    const list = classesOn(CAMU, "2026-11-05");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ from: "08:20", usual: false });
    expect(classesOn(CAMU, "2026-11-04").map((p) => p.from)).toEqual(["08:20", "09:25"]);
  });

  it("knows a holiday, and its last day from Camu's exclusive end", () => {
    expect(holidayOn(CAMU, "2026-11-06")?.title).toBe("Diwali Holidays");
    expect(holidayOn(CAMU, "2026-11-10")?.title).toBe("Diwali Holidays");
    expect(holidayOn(CAMU, "2026-11-11")).toBeUndefined();
    expect(holidayLastDay(CAMU.holidays![0])).toBe("2026-11-10");
    expect(classesOn(CAMU, "2026-11-09")).toEqual([]);
  });

  it("fills an unpublished day from the same weekday of the last published week", () => {
    // 11 Nov is a Wednesday, like 4 Nov
    const wed = classesOn(CAMU, "2026-11-11");
    expect(wed.map((p) => p.from)).toEqual(["08:20", "09:25"]);
    expect(wed.every((p) => p.usual && p.date === "2026-11-11")).toBe(true);
    // a fortnight past the last published day is a guess too far
    expect(classesOn(CAMU, "2026-11-25")).toEqual([]);
  });

  it("finds the next class across the holiday", () => {
    expect(nextClass(CAMU, "2026-11-07", "10:00")).toMatchObject({ date: "2026-11-11", from: "08:20" });
    expect(nextClass(CAMU, "2026-11-05", "08:00")).toMatchObject({ date: "2026-11-05", from: "08:20" });
  });
});

describe("Camu as attendance", () => {
  it("does the bunk maths on Camu's own counts", () => {
    expect(camuSummary(31, 43, 75)).toMatchObject({ attended: 31, total: 43, mustAttend: 5, state: "danger" });
    expect(camuSummary(40, 44, 75)).toMatchObject({ canMiss: 9, state: "safe" });
  });

  it("builds subjects, sessions and the overall figure from one sync", () => {
    const v = camuView(CAMU, 75, "2026-11-07")!;
    expect(v.subjects.map((s) => s.code)).toEqual(["CSET200", "CSET218"]);
    expect(v.overall).toMatchObject({ attended: 176, total: 245 });
    expect(Math.round(v.overall.pct!)).toBe(72);

    const dbms = v.sessions.filter((s) => s.subjectId === "camu:s-dbms");
    expect(dbms.find((s) => s.date === "2026-11-04")).toMatchObject({ status: "present", room: "P-LA-203", camu: true });
    expect(dbms.find((s) => s.date === "2026-11-05")).toMatchObject({ status: "absent" });
    // next week's Wednesday is on the timetable but not yet marked
    expect(dbms.find((s) => s.date === "2026-11-11")).toMatchObject({ status: "unmarked", usual: true });
    // every session is unique
    expect(new Set(v.sessions.map((s) => s.id)).size).toBe(v.sessions.length);
  });

  it("is nothing until Camu has sent subjects", () => {
    expect(camuView({ connected: true }, 75, "2026-11-07")).toBeNull();
  });
});

describe("LMS deadlines as tasks", () => {
  const item = (instance: number, due: number, name = "Lab 7: Joins"): LmsItem => ({
    id: instance * 10,
    instance,
    module: "assign",
    name,
    course: "Database Management Systems (CSET200)",
    due,
    url: `https://lms.bennett.edu.in/mod/assign/view.php?id=${instance}`,
    overdue: false,
    action: "Add submission",
  });
  const NOW = new Date(2026, 10, 7, 10, 0).getTime();
  const IN_3_DAYS = Math.floor(NOW / 1000) + 3 * 86400;

  beforeEach(async () => {
    await resetAll();
    resetImportMemo();
  });

  it("turns an item into a task with a local due date and time", () => {
    const t = lmsTask(item(1, Math.floor(new Date(2026, 10, 10, 23, 59).getTime() / 1000)));
    expect(t).toMatchObject({ title: "Lab 7: Joins", notes: "Database Management Systems", kind: "assignment", dueDate: "2026-11-10", dueTime: "23:59", source: "lms" });
  });

  it("adds new items, moves changed deadlines, and ticks off submitted ones", async () => {
    await importLms({ lms: { connected: true, syncedAt: 1, items: [item(1, IN_3_DAYS), item(2, IN_3_DAYS, "Quiz prep")] } }, NOW);
    expect(await db.tasks.count()).toBe(2);

    // item 1 moved by a day, item 2 submitted (gone from the list)
    await importLms({ lms: { connected: true, syncedAt: 2, items: [item(1, IN_3_DAYS + 86400)] } }, NOW);
    const one = await db.tasks.get(lmsTaskId({ module: "assign", instance: 1 }));
    const two = await db.tasks.get(lmsTaskId({ module: "assign", instance: 2 }));
    expect(one?.done).toBe(false);
    expect(one?.updatedAt).toBe(NOW);
    expect(two?.done).toBe(true);
  });

  it("leaves a task the student ticked by hand alone", async () => {
    await importLms({ lms: { connected: true, syncedAt: 1, items: [item(1, IN_3_DAYS)] } }, NOW);
    const id = lmsTaskId({ module: "assign", instance: 1 });
    await db.tasks.update(id, { done: true, doneAt: 5 });
    await importLms({ lms: { connected: true, syncedAt: 2, items: [item(1, IN_3_DAYS)] } }, NOW);
    expect((await db.tasks.get(id))?.done).toBe(true);
  });

  it("does nothing until the LMS is connected", async () => {
    await importLms({ lms: { connected: false, items: [item(1, IN_3_DAYS)] } }, NOW);
    expect(await db.tasks.count()).toBe(0);
  });
});

describe("labStarts: which classes are the lab", () => {
  // DayClass = a Camu period plus whether it was carried over from last week.
  const day = (from: string, to: string, subId: string, kind = "LECTURE") => ({
    ...period("2026-11-09", from, to, "Subject", "CODE", subId),
    kind,
    usual: false,
  });

  it("marks two back-to-back periods of the same subject as a lab", () => {
    const labs = labStarts([
      day("08:20", "09:20", "s-cpp"),
      day("09:20", "10:20", "s-cpp"),
      day("10:30", "11:30", "s-math"),
    ]);
    expect(labs.has("08:20")).toBe(true);
    expect(labs.has("09:20")).toBe(true);
    expect(labs.has("10:30")).toBe(false);
  });

  it("marks a single block that already runs two hours as a lab", () => {
    const labs = labStarts([day("14:00", "16:00", "s-dbms")]);
    expect(labs.has("14:00")).toBe(true);
  });

  it("trusts Camu when it does say practical", () => {
    const labs = labStarts([day("09:00", "10:00", "s-micro", "PRACTICAL")]);
    expect(labs.has("09:00")).toBe(true);
  });

  it("leaves ordinary one-hour lectures alone", () => {
    const labs = labStarts([
      day("08:20", "09:20", "s-cpp"),
      day("10:30", "11:30", "s-cpp"), // same subject but a gap between them
      day("11:30", "12:30", "s-math"), // adjacent but a different subject
    ]);
    expect(labs.size).toBe(0);
  });
});
