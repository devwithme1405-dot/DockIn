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
