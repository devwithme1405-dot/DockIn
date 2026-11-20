import { describe, expect, it } from "vitest";
import { assignInstance, docKind, findMyAssignment, pickableAssignments, solutionFor } from "@/lib/solution";
import type { Task } from "@/lib/types";

const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id,
  title,
  notes: "Database Management Systems",
  kind: "assignment",
  subjectId: null,
  dueDate: "2026-11-25",
  dueTime: "23:59",
  room: "",
  priority: "normal" as Task["priority"],
  done: false,
  doneAt: null,
  subtasks: [],
  source: "lms",
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  ...over,
});

describe("matching a friend's solution to my LMS", () => {
  const mine = [task("lms-assign-41", "DBMS Assignment 4"), task("lms-assign-77", "OS Lab 3", { notes: "Operating Systems" }), task("lms-quiz-5", "DBMS Quiz", { kind: "quiz" })];

  it("finds it by the assignment id first", () => {
    expect(findMyAssignment({ instance: 77, title: "something else", course: null }, mine)?.id).toBe("lms-assign-77");
  });
  it("falls back to the name (spacing and case don't matter)", () => {
    expect(findMyAssignment({ instance: 999, title: "dbms  assignment-4", course: null }, mine)?.id).toBe("lms-assign-41");
  });
  it("never matches a quiz or a missing one", () => {
    expect(findMyAssignment({ instance: 5, title: "DBMS Quiz", course: null }, mine)).toBeNull();
    expect(findMyAssignment({ instance: null, title: "Maths 2", course: null }, mine)).toBeNull();
  });
  it("offers open and recent assignments, open ones first", () => {
    const list = pickableAssignments(
      [...mine, task("lms-assign-1", "Old one", { dueDate: "2026-09-01" }), task("lms-assign-2", "Done one", { done: true, dueDate: "2026-11-20" })],
      new Date("2026-11-20T10:00:00").getTime(),
    );
    expect(list.map((t) => t.id)).toEqual(["lms-assign-41", "lms-assign-77", "lms-assign-2"]);
  });
  it("carries the sender's own details and the assignment", () => {
    const s = solutionFor(mine[0], { name: " Vaibhav Sharma ", roll: "S25CSEU0155" });
    expect(s).toMatchObject({ instance: 41, title: "DBMS Assignment 4", authorName: "Vaibhav Sharma", authorRoll: "S25CSEU0155", dueDate: "2026-11-25" });
    expect(assignInstance("lms-assign-12")).toBe(12);
    expect(docKind("a.DOCX")).toBe("docx");
    expect(docKind("a.pptx")).toBeNull();
  });
});
