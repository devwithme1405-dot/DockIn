import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addEvent,
  addSlot,
  addSubject,
  addTask,
  deleteEvent,
  ensureSessionsForDate,
  resetAll,
  setTaskDone,
  updateEvent,
} from "@/lib/repo";
import { bucketOf, countdownText, daysBetween, dueLabel, groupPending, parseQuick } from "@/lib/tasks";
import { buildDayMap, monthGrid } from "@/lib/calendar";
import type { Subject, Task } from "@/lib/types";

const TODAY = "2026-10-02"; // Friday

const subj = (name: string, code: string): Subject =>
  ({ id: code, name, code, color: "#000", createdAt: 0, updatedAt: 0 }) as Subject;
const SUBJECTS = [subj("Database Management Systems", "DBMS"), subj("Data Structures", "DSA")];

const mkTask = (over: Partial<Task>): Task =>
  ({
    id: Math.random().toString(),
    title: "t",
    notes: "",
    kind: "assignment",
    subjectId: null,
    dueDate: null,
    dueTime: null,
    room: "",
    priority: "med",
    done: false,
    doneAt: null,
    subtasks: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Task;

beforeEach(async () => {
  await resetAll();
});

describe("parseQuick", () => {
  it("reads dates, subject, kind and priority", () => {
    const r = parseQuick("DBMS assignment 3 tomorrow !", SUBJECTS, TODAY);
    expect(r.dueDate).toBe("2026-10-03");
    expect(r.subjectId).toBe("DBMS");
    expect(r.kind).toBe("assignment");
    expect(r.priority).toBe("high");
    expect(r.title).toBe("DBMS assignment 3");
  });
  it("handles weekdays, 'in N days' and calendar dates", () => {
    expect(parseQuick("DSA quiz monday", SUBJECTS, TODAY).dueDate).toBe("2026-10-05");
    expect(parseQuick("DSA quiz friday", SUBJECTS, TODAY).dueDate).toBe("2026-10-09");
    expect(parseQuick("report in 3 days", SUBJECTS, TODAY).dueDate).toBe("2026-10-05");
    expect(parseQuick("DBMS endsem 15 nov", SUBJECTS, TODAY)).toMatchObject({ dueDate: "2026-11-15", kind: "exam" });
    expect(parseQuick("submit lab oct 20", SUBJECTS, TODAY).dueDate).toBe("2026-10-20");
    expect(parseQuick("submit lab 1 oct", SUBJECTS, TODAY).dueDate).toBe("2027-10-01");
  });
  it("keeps a plain title when nothing is recognised", () => {
    const r = parseQuick("buy a calculator", SUBJECTS, TODAY);
    expect(r).toMatchObject({ title: "Buy a calculator", dueDate: null, subjectId: null, priority: "med" });
  });
});

describe("task helpers", () => {
  it("buckets and labels by due date", () => {
    expect(bucketOf(mkTask({ dueDate: "2026-10-01" }), TODAY)).toBe("overdue");
    expect(bucketOf(mkTask({ dueDate: TODAY }), TODAY)).toBe("today");
    expect(bucketOf(mkTask({ dueDate: "2026-10-09" }), TODAY)).toBe("week");
    expect(bucketOf(mkTask({ dueDate: "2026-10-20" }), TODAY)).toBe("later");
    expect(bucketOf(mkTask({}), TODAY)).toBe("none");
    expect(dueLabel(mkTask({ dueDate: "2026-09-30" }), TODAY)).toBe("Overdue by 2 days");
    expect(dueLabel(mkTask({ dueDate: TODAY, dueTime: "23:59" }), TODAY)).toBe("Today · 11:59 pm");
    expect(daysBetween(TODAY, "2026-11-01")).toBe(30);
    expect(countdownText(0)).toBe("Today");
  });
  it("groups pending tasks in order and hides done ones", () => {
    const g = groupPending(
      [mkTask({ dueDate: "2026-10-20" }), mkTask({ dueDate: TODAY }), mkTask({ dueDate: TODAY, done: true }), mkTask({ dueDate: "2026-09-01" })],
      TODAY,
    );
    expect(g.map((x) => x.bucket)).toEqual(["overdue", "today", "later"]);
    expect(g[1].items).toHaveLength(1);
  });
  it("completes a task and stores the time", async () => {
    const t = await addTask({ title: "Write report" });
    await setTaskDone(t.id, true);
    expect((await db.tasks.get(t.id))?.done).toBe(true);
    expect((await db.tasks.get(t.id))?.doneAt).toBeTruthy();
    await setTaskDone(t.id, false);
    expect((await db.tasks.get(t.id))?.doneAt).toBeNull();
  });
});

describe("calendar", () => {
  it("builds a 6-week Monday-first grid", () => {
    const g = monthGrid("2026-10");
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-09-28"); // Oct 1 2026 is a Thursday
    expect(g).toContain("2026-10-31");
  });
  it("maps tasks, exams and multi-day events onto days", () => {
    const m = buildDayMap(
      [mkTask({ dueDate: "2026-10-09" }), mkTask({ dueDate: "2026-10-09", kind: "exam" })],
      [{ id: "e", title: "Diwali break", kind: "holiday", date: "2026-10-10", endDate: "2026-10-12", note: "", createdAt: 0, updatedAt: 0 }],
      [],
      "2026-09-28",
      "2026-11-08",
    );
    expect(m.get("2026-10-09")?.due).toHaveLength(1);
    expect(m.get("2026-10-09")?.exams).toHaveLength(1);
    expect(m.get("2026-10-11")?.holiday).toHaveLength(1);
    expect(m.get("2026-10-13")).toBeUndefined();
  });
});

describe("holidays and attendance", () => {
  it("turns classes on a holiday into holiday sessions, and back again", async () => {
    const sub = await addSubject({ name: "Data Structures", code: "DSA" });
    await addSlot({ subjectId: sub.id, weekday: 1, start: "09:25", end: "10:25", kind: "lecture" });
    const monday = "2026-10-05";
    await ensureSessionsForDate(monday);
    const ev = await addEvent({ title: "Fest", kind: "holiday", date: monday });
    expect((await db.sessions.where("date").equals(monday).toArray())[0].status).toBe("holiday");
    await deleteEvent(ev.id);
    expect((await db.sessions.where("date").equals(monday).toArray())[0].status).toBe("unmarked");
  });
  it("creates future classes as holidays and keeps marked classes", async () => {
    const sub = await addSubject({ name: "Data Structures", code: "DSA" });
    await addSlot({ subjectId: sub.id, weekday: 1, start: "09:25", end: "10:25", kind: "lecture" });
    await addEvent({ title: "Break", kind: "holiday", date: "2026-10-12", endDate: "2026-10-13" });
    await ensureSessionsForDate("2026-10-12");
    expect((await db.sessions.where("date").equals("2026-10-12").toArray())[0].status).toBe("holiday");
    // a class already marked present stays present when a holiday is added later
    await ensureSessionsForDate("2026-10-19");
    const s = (await db.sessions.where("date").equals("2026-10-19").toArray())[0];
    await db.sessions.update(s.id, { status: "present" });
    const ev = await addEvent({ title: "Closed", kind: "holiday", date: "2026-10-19" });
    expect((await db.sessions.get(s.id))?.status).toBe("present");
    await updateEvent(ev.id, { title: "Closed", kind: "event", date: "2026-10-19" });
    expect((await db.sessions.get(s.id))?.status).toBe("present");
  });
});
