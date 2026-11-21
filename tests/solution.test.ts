import { describe, expect, it } from "vitest";
import { assignInstance, docKind, findMyAssignment, hits, pickableAssignments, solutionFor, suggestNames, theirDetails } from "@/lib/solution";
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
  it("never matches by name across subjects, or when two could fit", () => {
    expect(findMyAssignment({ instance: 999, title: "OS Lab 3", course: "Computer Networks" }, mine)).toBeNull();
    expect(findMyAssignment({ instance: 999, title: "OS Lab 3", course: "Operating Systems" }, mine)?.id).toBe("lms-assign-77");
    const twins = [...mine, task("lms-assign-90", "DBMS Assignment 4", { notes: "" })];
    expect(findMyAssignment({ instance: 999, title: "DBMS Assignment 4", course: null }, twins)).toBeNull();
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

describe("finding whose name to swap, when the sender got it wrong", () => {
  const text = "DBMS ASSIGNMENT 4\nName: Yash Agarwal   Enrollment: S25CSEU0155 Section E1\nSubmitted by YASH AGARWAL (S25CSEU0155) to Dr. Rakesh Gupta.";
  const me = { name: "Sachin Kumar", roll: "E23CSEU0155" };

  it("counts names whatever the spacing and case", () => {
    expect(hits(text, "yash agarwal")).toBe(2);
    expect(hits("NameYashAgarwal", "Yash Agarwal")).toBe(1);
    expect(hits(text, "Rahul")).toBe(0);
  });
  it("reads the author's name off the page", () => {
    expect(suggestNames(text)).toEqual(["Yash Agarwal"]);
    expect(suggestNames("Student Name - Riya Sharma\nRoll No: E23")).toEqual(["Riya Sharma"]);
  });
  it("uses the file's own name and roll when the sender's aren't in it", () => {
    expect(theirDetails(text, { name: "Yashh", roll: "" }, me)).toEqual({ name: "Yash Agarwal", roll: "S25CSEU0155" });
  });
  it("swaps the whole name when only the first name was given", () => {
    expect(theirDetails(text, { name: "Yash", roll: "S25CSEU0155" }, me)).toEqual({ name: "Yash Agarwal", roll: "S25CSEU0155" });
  });
  it("never picks my own enrollment as theirs", () => {
    expect(theirDetails("Roll: E23CSEU0155", { name: "", roll: "" }, me).roll).toBe("");
  });
});
