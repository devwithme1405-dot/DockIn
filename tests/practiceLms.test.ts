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

  it("a real LMS sync never ticks the practice assignments off", async () => {
    await P.startPractice();
    resetImportMemo();
    await importLms({ lms: { connected: true, syncedAt: Date.now(), items: [] } } as never);
    expect((await db.tasks.get("lms-assign-900101"))?.done).toBe(false);
  });
});
