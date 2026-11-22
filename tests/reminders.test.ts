import { describe, expect, it } from "vitest";
import { adviceFor, buildReminders } from "@/lib/reminders";
import type { AttendanceSummary, Subject, Task } from "@/lib/types";
import type { ViewSession } from "@/lib/college";

const sub = (id: string, name: string): Subject => ({ id, name, code: id, color: "#000", createdAt: 0, updatedAt: 0, deletedAt: null });
const sum = (pct: number, state: AttendanceSummary["state"], canMiss: number, mustAttend: number): AttendanceSummary => ({
  attended: 0,
  total: 0,
  pct,
  canMiss,
  mustAttend,
  state,
});
const ses = (id: string, subjectId: string, date: string, start: string, end: string): ViewSession => ({
  id,
  slotId: id,
  subjectId,
  date,
  start,
  end,
  kind: "lecture",
  weight: 1,
  status: "unmarked",
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  room: "N-108",
});

const day = "2026-03-10"; // a plain Tuesday, no holiday
const at = (hm: string) => new Date(`${day}T${hm}:00`).getTime();
const dbms = sub("dbms", "DBMS");
const cpp = sub("cpp", "C++");
const stats = [
  { subject: dbms, summary: sum(82, "safe", 4, 0) },
  { subject: cpp, summary: sum(67, "danger", 0, 9) },
];

describe("class reminders", () => {
  const items = buildReminders({
    sessions: [ses("a", "dbms", day, "09:25", "10:25"), ses("b", "cpp", day, "10:30", "11:30")],
    subjects: [dbms, cpp],
    tasks: [],
    overall: { pct: 75, state: "warn" },
    stats,
    target: 75,
    today: day,
    now: at("09:00"),
  });

  it("tells you where to go the moment the class before ends", () => {
    const after = items.find((i) => i.at === at("10:26"));
    expect(after?.title).toBe("DBMS done — next, go to C++");
    expect(after?.body).toContain("only 67%");
    expect(after?.body).toContain("next 9 classes");
  });

  it("nudges again right before a back-to-back class, not while the last is on", () => {
    const pre = items.find((i) => i.title.startsWith("C++"));
    expect(pre?.at).toBe(at("10:29"));
    expect(pre?.title).toBe("C++ starts now — go");
  });

  it("says a safe class is skippable, and gives ten minutes for the first one", () => {
    const pre = items.find((i) => i.title.startsWith("DBMS in"));
    expect(pre?.at).toBe(at("09:15"));
    expect(pre?.body).toContain("can miss 4 more classes");
  });

  it("keeps ids unique and the list in time order", () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...items].sort((a, b) => a.at - b.at)).toEqual(items);
  });
});

describe("deadline last call", () => {
  it("warns 30 minutes before a timed deadline today", () => {
    const task = {
      id: "t",
      title: "Assign 9",
      notes: "",
      kind: "assignment",
      subjectId: null,
      dueDate: day,
      dueTime: "23:59",
      room: "",
      priority: "med",
      done: false,
      doneAt: null,
      subtasks: [],
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    } as Task;
    const items = buildReminders({ sessions: [], subjects: [], tasks: [task], overall: null, target: 75, today: day, now: at("12:00") });
    expect(items.find((i) => i.at === at("23:29"))?.title).toBe("Assign 9 is due in 30 mins");
  });
});

describe("advice", () => {
  it("has nothing to say without numbers", () => {
    expect(adviceFor(undefined, 75)).toEqual({ go: true, line: "" });
  });
  it("calls the last safe class out", () => {
    expect(adviceFor(sum(75, "warn", 0, 0), 75).line).toContain("no bunk left");
  });
});

describe("shared task nudges", () => {
  it("reminds a day before and half an hour before, only while still open", () => {
    const now = new Date(2026, 10, 19, 9, 0).getTime();
    const items = buildReminders({
      sessions: [],
      subjects: [],
      tasks: [],
      overall: null,
      target: 75,
      today: "2026-11-19",
      now,
      shared: [{ id: "s1", title: "Lab 7: Joins", dueDate: "2026-11-20", dueTime: "20:00", from: "Riya in CSE E1" }],
    });
    const mine = items.filter((i) => i.title.includes("Lab 7"));
    expect(mine.map((i) => new Date(i.at).getHours() * 60 + new Date(i.at).getMinutes())).toEqual([20 * 60, 19 * 60 + 30]);
    expect(mine[0].title).toBe("Due tomorrow: Lab 7: Joins");
    expect(mine[1].title).toBe("Lab 7: Joins is due in 30 mins");
  });
});

describe("solution reminders", () => {
  it("nudges a minute after a friend sends it, and 3 hours before it is due", () => {
    const sent = at("12:00");
    const items = buildReminders({
      sessions: [],
      subjects: [],
      tasks: [],
      overall: null,
      target: 75,
      today: day,
      now: sent + 10_000,
      solutions: [{ id: "m1", title: "DBMS Assignment 4", from: "Vaibhav", sentAt: sent, dueDate: "2026-03-11", dueTime: "23:59", thread: "g:abc" }],
    });
    const mine = items.filter((x) => x.title.includes("DBMS Assignment 4"));
    expect(mine).toHaveLength(2);
    expect(mine[0].at).toBe(sent + 90_000);
    expect(mine[0].title).toMatch(/haven't submitted/);
    expect(mine[0].body).toMatch(/Vaibhav/);
    expect(mine[0].path).toBe("/circle?chat=g%3Aabc");
    expect(mine[1].at).toBe(new Date("2026-03-11T20:59:00").getTime());
  });

  it("says nothing once it is too late for the first nudge and there is no deadline", () => {
    const items = buildReminders({
      sessions: [],
      subjects: [],
      tasks: [],
      overall: null,
      target: 75,
      today: day,
      now: at("15:00"),
      solutions: [{ id: "m1", title: "OS Lab", from: "Yash", sentAt: at("12:00"), dueDate: null, dueTime: null, thread: "d:a:b" }],
    });
    expect(items.filter((x) => x.title.includes("OS Lab"))).toHaveLength(0);
  });
});

describe("morning attendance nudge only on class days", () => {
  const low = { pct: 62, state: "danger" as const };
  const wake = (date: string) => new Date(`${date}T06:00:00`).getTime();
  const nudge = (items: { title: string }[]) => items.find((i) => /Attendance is low|don't skip today/.test(i.title));

  it("comes on a weekday with classes", () => {
    const d = "2026-03-10"; // Tuesday
    const items = buildReminders({ sessions: [ses("a", "dbms", d, "09:25", "10:25")], subjects: [dbms], tasks: [], overall: low, stats, target: 75, today: d, now: wake(d) });
    expect(nudge(items)).toBeTruthy();
  });

  it("not on a Saturday or Sunday, even with attendance low", () => {
    for (const d of ["2026-03-14", "2026-03-15"]) {
      const items = buildReminders({ sessions: [], subjects: [dbms], tasks: [], overall: low, stats, target: 75, today: d, now: wake(d) });
      expect(nudge(items)).toBeUndefined();
    }
  });

  it("not on an official holiday, even if a class was on the timetable", () => {
    const d = "2026-11-24"; // Guru Nanak Jayanti (a Tuesday) on the academic calendar
    const items = buildReminders({ sessions: [ses("a", "dbms", d, "09:25", "10:25")], subjects: [dbms], tasks: [], overall: low, stats, target: 75, today: d, now: wake(d) });
    expect(nudge(items)).toBeUndefined();
  });

  it("not on a weekday with no classes (or a timetable Camu hasn't published)", () => {
    const d = "2026-03-11";
    const items = buildReminders({ sessions: [], subjects: [dbms], tasks: [], overall: low, stats, target: 75, today: d, now: wake(d) });
    expect(nudge(items)).toBeUndefined();
  });
});
