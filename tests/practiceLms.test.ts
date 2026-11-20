import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

// node has no localStorage; the practice switch lives there.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

const { db } = await import("@/lib/db");
const P = await import("@/lib/practiceLms");
const { submitToLms, DraftOnly, WebOnlyLms } = await import("@/lib/lmsSubmit");
const { importLms, resetImportMemo } = await import("@/lib/college");

const pdf = new Blob(["%PDF-1.4 practice"], { type: "application/pdf" });

describe("practice LMS", () => {
  beforeEach(async () => {
    await db.tasks.clear();
    await db.practiceSubs.clear();
    await db.practiceAttempts.clear();
    store.clear();
  });

  it("puts three practice assignments in Tasks, open, and takes them away again", async () => {
    await P.startPractice(new Date("2026-11-20T10:00:00").getTime());
    expect(P.practiceOn()).toBe(true);
    const t = await db.tasks.get("lms-assign-900101");
    expect(t).toMatchObject({ source: "lms", done: false, dueDate: "2026-11-23", deletedAt: null });
    expect(await db.tasks.count()).toBe(3);
    await P.stopPractice();
    expect(P.practiceOn()).toBe(false);
    expect((await db.tasks.get("lms-assign-900101"))?.deletedAt).toBeTruthy();
  });

  it("keeps the handed-in file, never calling the real LMS", async () => {
    await P.startPractice();
    const r = await submitToLms(900101, pdf, "DBMS_Sachin.pdf");
    expect(r.checked).toBe(true);
    const sub = await db.practiceSubs.get(900101);
    expect(sub).toMatchObject({ name: "DBMS_Sachin.pdf", status: "submitted" });
    expect(await sub!.blob.text()).toBe("%PDF-1.4 practice");
  });

  it("can fail, stay a draft or refuse once — then works again", async () => {
    await P.startPractice();
    P.setNextAnswer("fail");
    await expect(submitToLms(900102, pdf, "a.pdf")).rejects.toThrow(/upload failed/);
    expect(await db.practiceSubs.get(900102)).toBeUndefined();
    P.setNextAnswer("draft");
    await expect(submitToLms(900102, pdf, "a.pdf")).rejects.toBeInstanceOf(DraftOnly);
    P.setNextAnswer("webonly");
    await expect(submitToLms(900102, pdf, "a.pdf")).rejects.toBeInstanceOf(WebOnlyLms);
    expect(P.nextAnswer()).toBe("ok");
    await expect(submitToLms(900102, pdf, "a.pdf")).resolves.toEqual({ checked: true });
  }, 15_000);

  it("logs every try, kept or not, against the right assignment", async () => {
    await P.startPractice();
    P.setNextAnswer("fail");
    await submitToLms(900103, pdf, "try1.pdf").catch(() => {});
    await submitToLms(900103, pdf, "try2.pdf");
    const tries = await db.practiceAttempts.where("instance").equals(900103).toArray();
    expect(tries.map((t) => [t.name, t.status])).toEqual([
      ["try1.pdf", "failed"],
      ["try2.pdf", "submitted"],
    ]);
    expect(tries[0].blob).toBeUndefined();
    expect(await db.practiceAttempts.where("instance").equals(900101).count()).toBe(0);
  }, 15_000);

  it("adds my own assignment to Tasks, and removes it", async () => {
    const n = await P.addPracticeAssignment({ title: "CN Assignment 2", course: "Computer Networks", dueDate: "2026-11-28", dueTime: "17:00" });
    expect(P.isPractice(n)).toBe(true);
    expect(P.practiceOn()).toBe(true);
    const t = await db.tasks.get(`lms-assign-${n}`);
    expect(t).toMatchObject({ title: "CN Assignment 2", notes: "Computer Networks", dueDate: "2026-11-28", dueTime: "17:00", source: "lms", done: false });
    await P.removePracticeAssignment(n);
    expect((await db.tasks.get(`lms-assign-${n}`))?.deletedAt).toBeTruthy();
  });

  it("a friend's solution for a practice assignment adds it here — only with practice on", async () => {
    const sol = { instance: 934567, title: "CN Assignment 2", course: "Computer Networks", dueDate: "2026-11-28", dueTime: "17:00" };
    expect(await P.ensurePracticeFromSolution(sol)).toBe(false);
    expect(await db.tasks.get("lms-assign-934567")).toBeUndefined();
    await P.startPractice();
    expect(await P.ensurePracticeFromSolution(sol)).toBe(true);
    expect(await db.tasks.get("lms-assign-934567")).toMatchObject({ title: "CN Assignment 2", done: false });
    expect(await P.ensurePracticeFromSolution(sol)).toBe(false);
    // A real assignment id is never touched.
    expect(await P.ensurePracticeFromSolution({ ...sol, instance: 41 })).toBe(false);
  });

  it("a real LMS sync never ticks the practice assignments off", async () => {
    await P.startPractice();
    resetImportMemo();
    await importLms({ lms: { connected: true, syncedAt: Date.now(), items: [] } } as never);
    expect((await db.tasks.get("lms-assign-900101"))?.done).toBe(false);
  });
});
