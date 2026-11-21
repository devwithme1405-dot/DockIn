import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

// node has no localStorage.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

const { db } = await import("../src/lib/db");
const { retirePractice, isPracticeTask } = await import("../src/lib/practiceLms");

const task = (id: string) => ({
  id, title: id, notes: "", kind: "assignment" as const, subjectId: null, dueDate: "2026-11-30", dueTime: null, room: "",
  priority: "med" as const, done: false, doneAt: null, subtasks: [], createdAt: 1, updatedAt: 1, deletedAt: null,
});

describe("the practice LMS is retired", () => {
  beforeEach(async () => {
    store.clear();
    await db.tasks.clear();
  });

  it("only practice instances count as practice", () => {
    expect(isPracticeTask("lms-assign-900101")).toBe(true);
    expect(isPracticeTask("lms-assign-91")).toBe(false);
    expect(isPracticeTask("lms-quiz-900101")).toBe(false);
  });

  it("removes the pretend assignments and settings once, and leaves real ones", async () => {
    store.set("dockin-practice-group", "g1");
    await db.tasks.bulkPut([task("lms-assign-900101"), task("lms-assign-900102"), task("lms-assign-91"), task("t-own")]);
    expect(await retirePractice(5)).toBe(2);
    const left = (await db.tasks.toArray()).filter((t) => !t.deletedAt).map((t) => t.id).sort();
    expect(left).toEqual(["lms-assign-91", "t-own"]);
    expect(store.has("dockin-practice-group")).toBe(false);
    // second run does nothing
    await db.tasks.put(task("lms-assign-900103"));
    expect(await retirePractice(6)).toBe(0);
  });
});
