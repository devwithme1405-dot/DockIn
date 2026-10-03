import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addSlot, addSubject, appliesOn, applyWeekPlan, ensureSessionsForDate, resetAll } from "@/lib/repo";
import {
  DEFAULT_GRID,
  inferGrid,
  periodAt,
  periodsOf,
  sanitiseGrid,
  spanOf,
  spanTimes,
} from "@/lib/periods";

describe("the period grid", () => {
  it("lays out the real college day", () => {
    const day = periodsOf(DEFAULT_GRID).map((p) => `${p.start}-${p.end}`);
    expect(day).toEqual([
      "08:20-09:20",
      "09:25-10:25",
      "10:30-11:30",
      "11:35-12:35",
      "12:40-13:40",
      "13:45-14:45",
      "14:50-15:50",
      "15:55-16:55",
      "17:00-18:00",
    ]);
  });

  it("spans a practical across whole periods", () => {
    // a two-period lab, and the four-period one that really exists on Tuesdays
    expect(spanTimes(DEFAULT_GRID, 1, 2)).toEqual({ start: "08:20", end: "10:25" });
    expect(spanTimes(DEFAULT_GRID, 1, 4)).toEqual({ start: "08:20", end: "12:35" });
    expect(spanTimes(DEFAULT_GRID, 5, 2)).toEqual({ start: "12:40", end: "14:45" });
    // and never runs off the end of the day
    expect(spanTimes(DEFAULT_GRID, 9, 4).end).toBe("18:00");
  });

  it("reads an existing timetable back into periods", () => {
    expect(periodAt(DEFAULT_GRID, "09:25")).toBe(2);
    expect(periodAt(DEFAULT_GRID, "15:55")).toBe(8);
    // a few minutes of drift from typing it by hand still lands on the period
    expect(periodAt(DEFAULT_GRID, "09:28")).toBe(2);
    expect(periodAt(DEFAULT_GRID, "20:00")).toBeNull();

    expect(spanOf(DEFAULT_GRID, "09:25", "10:25")).toBe(1);
    expect(spanOf(DEFAULT_GRID, "08:20", "10:25")).toBe(2);
    expect(spanOf(DEFAULT_GRID, "08:20", "12:35")).toBe(4);
  });

  it("works out the grid someone's own classes were built on", () => {
    const sachin = [
      { start: "09:25", end: "10:25" },
      { start: "12:40", end: "14:45" },
      { start: "15:55", end: "18:00" },
      { start: "08:20", end: "12:35" },
      { start: "13:45", end: "14:45" },
      { start: "14:50", end: "15:50" },
      { start: "10:30", end: "11:30" },
      { start: "11:35", end: "12:35" },
    ];
    expect(inferGrid(sachin)).toMatchObject({ start: "08:20", length: 60, gap: 5 });
    // a college that starts at nine with fifty-minute periods
    expect(inferGrid([
      { start: "09:00", end: "09:50" },
      { start: "10:00", end: "10:50" },
      { start: "11:00", end: "11:50" },
    ])).toMatchObject({ start: "09:00", length: 50, gap: 10 });
    // not enough to go on falls back rather than inventing something
    expect(inferGrid([])).toEqual(DEFAULT_GRID);
  });

  it("refuses a nonsense grid instead of drawing an empty day", () => {
    expect(sanitiseGrid({ start: "oops", length: -5, gap: 999, count: 0 })).toEqual(DEFAULT_GRID);
    expect(sanitiseGrid(undefined)).toEqual(DEFAULT_GRID);
    expect(periodsOf({ start: "08:20", length: 0, gap: 0, count: 0 }).length).toBe(DEFAULT_GRID.count);
  });
});

describe("a timetable that changes mid-semester", () => {
  beforeEach(async () => {
    await resetAll();
  });

  it("decides which days a slot belongs to", () => {
    expect(appliesOn({ from: null, until: null }, "2026-10-05")).toBe(true);
    expect(appliesOn({ from: "2026-10-06", until: null }, "2026-10-05")).toBe(false);
    expect(appliesOn({ from: "2026-10-06", until: null }, "2026-10-06")).toBe(true);
    expect(appliesOn({ from: null, until: "2026-10-05" }, "2026-10-06")).toBe(false);
  });

  it("leaves attendance already recorded against the old week alone", async () => {
    const dsa = await addSubject({ name: "Data Structures", code: "DSA" });
    await addSlot({ subjectId: dsa.id, weekday: 1, start: "09:25", end: "10:25", kind: "lecture" });

    const firstMonday = "2026-10-05";
    await ensureSessionsForDate(firstMonday);
    const [before] = await db.sessions.toArray();
    await db.sessions.update(before.id, { status: "present" });

    // From the 12th the class moves to the afternoon.
    const changeDay = "2026-10-12";
    await applyWeekPlan(
      {
        subjects: [{ name: "Data Structures", code: "DSA" }],
        classes: [{ subject: 0, weekday: 1, start: "13:45", end: "14:45", kind: "lecture" }],
      },
      changeDay,
    );

    // The marked class is untouched, and nothing new appears on that old day.
    await ensureSessionsForDate(firstMonday);
    const old = await db.sessions.where("date").equals(firstMonday).toArray();
    expect(old).toHaveLength(1);
    expect(old[0]).toMatchObject({ status: "present", start: "09:25" });

    // The new week starts on the change day, and only the new time shows up.
    await ensureSessionsForDate(changeDay);
    const now = await db.sessions.where("date").equals(changeDay).toArray();
    expect(now).toHaveLength(1);
    expect(now[0].start).toBe("13:45");

    // The subject was reused rather than duplicated.
    expect(await db.subjects.filter((s) => !s.deletedAt).count()).toBe(1);
  });

  it("replaces outright when there is no history to protect", async () => {
    await applyWeekPlan({
      subjects: [{ name: "DBMS" }, { name: "Full Stack" }],
      classes: [
        { subject: 0, weekday: 4, start: "09:25", end: "10:25", kind: "lecture" },
        { subject: 1, weekday: 2, start: "08:20", end: "12:35", kind: "practical" },
      ],
    });
    expect(await db.subjects.filter((s) => !s.deletedAt).count()).toBe(2);
    expect(await db.slots.filter((s) => !s.deletedAt).count()).toBe(2);

    await applyWeekPlan({
      subjects: [{ name: "DBMS" }],
      classes: [{ subject: 0, weekday: 4, start: "11:35", end: "12:35", kind: "lecture" }],
    });
    const slots = await db.slots.filter((s) => !s.deletedAt).toArray();
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toBe("11:35");
  });
});

describe("changing a class that already has attendance", () => {
  beforeEach(async () => {
    await resetAll();
  });

  it("fixes a typo in place when nothing has been marked", async () => {
    const { reviseSlot } = await import("@/lib/repo");
    const sub = await addSubject({ name: "DBMS" });
    const slot = await addSlot({ subjectId: sub.id, weekday: 1, start: "09:25", end: "10:25", kind: "lecture" });

    await reviseSlot(slot.id, { start: "10:30", end: "11:30" });

    const slots = await db.slots.filter((s) => !s.deletedAt).toArray();
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ id: slot.id, start: "10:30", from: null, until: null });
  });

  it("starts a new class today rather than rewriting the old record", async () => {
    const { reviseSlot } = await import("@/lib/repo");
    const sub = await addSubject({ name: "DBMS" });
    const slot = await addSlot({ subjectId: sub.id, weekday: 1, start: "09:25", end: "10:25", kind: "lecture" });

    // something was marked before today
    const t = Date.now();
    await db.sessions.add({
      id: `${slot.id}:2026-09-07`,
      slotId: slot.id,
      subjectId: sub.id,
      date: "2026-09-07",
      start: "09:25",
      end: "10:25",
      kind: "lecture",
      weight: 1,
      status: "present",
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    });

    await reviseSlot(slot.id, { start: "13:45", end: "14:45" });

    const slots = (await db.slots.filter((s) => !s.deletedAt).toArray()).sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({ id: slot.id, start: "09:25" });
    expect(slots[0].until).toBeTruthy();
    expect(slots[1]).toMatchObject({ start: "13:45", until: null });
    expect(slots[1].from).toBeTruthy();

    // and the old record still says what it always said
    const old = await db.sessions.get(`${slot.id}:2026-09-07`);
    expect(old).toMatchObject({ status: "present", start: "09:25" });
  });

  it("keeps a removed class's history but stops generating it", async () => {
    const { retireSlot } = await import("@/lib/repo");
    const sub = await addSubject({ name: "DBMS" });
    const slot = await addSlot({ subjectId: sub.id, weekday: 1, start: "09:25", end: "10:25", kind: "lecture" });
    const t = Date.now();
    await db.sessions.add({
      id: `${slot.id}:2026-09-07`, slotId: slot.id, subjectId: sub.id, date: "2026-09-07",
      start: "09:25", end: "10:25", kind: "lecture", weight: 1, status: "absent",
      createdAt: t, updatedAt: t, deletedAt: null,
    });

    await retireSlot(slot.id);
    const kept = await db.slots.get(slot.id);
    expect(kept!.deletedAt).toBeNull();
    expect(kept!.until).toBeTruthy();
    expect(await db.sessions.get(`${slot.id}:2026-09-07`)).toBeTruthy();
  });
});

describe("a retired class disappears from the week ahead", () => {
  it("is left off the days it no longer runs on", async () => {
    const { slotsOn } = await import("@/lib/calendar");
    const base = {
      id: "s1", subjectId: "x", weekday: 1, start: "09:25", end: "10:25",
      kind: "lecture" as const, weight: 1, createdAt: 0, updatedAt: 0, deletedAt: null,
    };
    const mondayBefore = "2026-10-05";
    const mondayAfter = "2026-10-19";
    const stopped = { ...base, until: "2026-10-12" };

    expect(slotsOn([stopped], mondayBefore)).toHaveLength(1);
    expect(slotsOn([stopped], mondayAfter)).toHaveLength(0);

    const starts = { ...base, from: "2026-10-12" };
    expect(slotsOn([starts], mondayBefore)).toHaveLength(0);
    expect(slotsOn([starts], mondayAfter)).toHaveLength(1);
  });
});
