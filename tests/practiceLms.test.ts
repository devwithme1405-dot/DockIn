import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// node has no localStorage; the practice group and next answer live there.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

// A tiny Supabase: two tables, a bucket, and whoever is "signed in".
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { practice_assignments: [], practice_submissions: [] };
const bucket = new Map<string, Blob>();
let me = "u-sachin";
let seq = 0;

function query(table: string) {
  const filters: [string, unknown][] = [];
  let mode: "select" | "delete" = "select";
  const rows = () => tables[table].filter((r) => filters.every(([k, v]) => r[k] === v));
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => {
      filters.push([k, v]);
      return q;
    },
    order: () => q,
    limit: () => q,
    delete: () => {
      mode = "delete";
      return q;
    },
    insert: async (data: Row | Row[]) => {
      for (const r of Array.isArray(data) ? data : [data]) tables[table].push({ id: `id${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...r });
      return { error: null };
    },
    then: (res: (v: { data: Row[] | null; error: null }) => void) => {
      if (mode === "delete") {
        const gone = new Set(rows());
        tables[table] = tables[table].filter((r) => !gone.has(r));
        return Promise.resolve({ data: null, error: null }).then(res);
      }
      return Promise.resolve({ data: rows(), error: null }).then(res);
    },
  };
  return q;
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: me } } } }) },
    from: (t: string) => query(t),
    storage: {
      from: () => ({
        upload: async (path: string, blob: Blob) => (bucket.set(path, blob), { error: null }),
        remove: async (paths: string[]) => (paths.forEach((p) => bucket.delete(p)), { error: null }),
        download: async (path: string) => ({ data: bucket.get(path) ?? null, error: bucket.has(path) ? null : { message: "gone" } }),
      }),
    },
  }),
}));

const { db } = await import("@/lib/db");
const P = await import("@/lib/practiceLms");
const { submitToLms, DraftOnly, WebOnlyLms } = await import("@/lib/lmsSubmit");
const { importLms, resetImportMemo } = await import("@/lib/college");

const G = "group-cse-e1";
const pdf = new Blob(["%PDF-1.4 practice"], { type: "application/pdf" });
const practiceIds = async () => (await db.tasks.filter((t) => P.isPracticeTask(t.id) && !t.deletedAt).toArray()).map((t) => t.title).sort();

describe("Practice LMS (shared by a group)", () => {
  beforeEach(async () => {
    await db.tasks.clear();
    store.clear();
    tables.practice_assignments = [];
    tables.practice_submissions = [];
    bucket.clear();
    me = "u-sachin";
  });

  it("turning it on sets up three starter assignments once, in Tasks", async () => {
    await P.startPractice(G);
    expect(P.practiceGroup()).toBe(G);
    expect(tables.practice_assignments).toHaveLength(3);
    expect(await practiceIds()).toEqual(["DBMS Assignment 4 (practice)", "Maths Tutorial 5 (practice)", "OS Lab 3 (practice)"]);
    // A friend turning it on for the same group gets the same ones, not three more.
    store.clear();
    await db.tasks.clear();
    me = "u-vaibhav";
    await P.startPractice(G);
    expect(tables.practice_assignments).toHaveLength(3);
    expect(await practiceIds()).toHaveLength(3);
  });

  it("an added assignment reaches everyone's Tasks; a removed one leaves", async () => {
    await P.startPractice(G);
    const n = await P.addPracticeAssignment({ title: "CN Assignment 2", course: "Computer Networks", dueDate: "2026-11-28", dueTime: "17:00" });
    expect(P.isPractice(n)).toBe(true);
    expect(await db.tasks.get(`lms-assign-${n}`)).toMatchObject({ title: "CN Assignment 2", notes: "Computer Networks", dueDate: "2026-11-28", dueTime: "17:00", source: "lms" });
    await P.removePracticeAssignment(n);
    expect((await db.tasks.get(`lms-assign-${n}`))?.deletedAt).toBeTruthy();
  });

  it("submitting uploads to the group and is visible to everyone, never the real LMS", async () => {
    await P.startPractice(G);
    const a = (await P.fetchAssignments(G))[0];
    const r = await submitToLms(a.instance, pdf, "DBMS Sachin.pdf");
    expect(r.checked).toBe(true);
    me = "u-laptop-viewer";
    const subs = await P.fetchSubmissions(G);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ instance: a.instance, userId: "u-sachin", name: "DBMS Sachin.pdf", status: "submitted" });
    expect(await (await P.openPracticeFile(subs[0].path!)).text()).toBe("%PDF-1.4 practice");
  });

  it("can fail, stay a draft or refuse once — logged — then works again", async () => {
    await P.startPractice(G);
    const { instance } = (await P.fetchAssignments(G))[1];
    P.setNextAnswer("fail");
    await expect(submitToLms(instance, pdf, "a.pdf")).rejects.toThrow(/upload failed/);
    P.setNextAnswer("draft");
    await expect(submitToLms(instance, pdf, "a.pdf")).rejects.toBeInstanceOf(DraftOnly);
    P.setNextAnswer("webonly");
    await expect(submitToLms(instance, pdf, "a.pdf")).rejects.toBeInstanceOf(WebOnlyLms);
    expect(P.nextAnswer()).toBe("ok");
    await expect(submitToLms(instance, pdf, "a.pdf")).resolves.toEqual({ checked: true });
    const tries = (await P.fetchSubmissions(G)).map((s) => [s.status, !!s.path]);
    expect(tries).toEqual([
      ["failed", false],
      ["draft", true],
      ["refused", false],
      ["submitted", true],
    ]);
  }, 20_000);

  it("my task is ticked from the server, and clearing submissions opens it again", async () => {
    await P.startPractice(G);
    const { instance } = (await P.fetchAssignments(G))[0];
    await submitToLms(instance, pdf, "x.pdf");
    await P.pullPractice();
    expect((await db.tasks.get(`lms-assign-${instance}`))?.done).toBe(true);
    await P.resetPractice();
    expect(tables.practice_submissions).toHaveLength(0);
    expect(bucket.size).toBe(0);
    expect((await db.tasks.get(`lms-assign-${instance}`))?.done).toBe(false);
  });

  it("a friend's solution for one of the group's assignments adds it here", async () => {
    await P.startPractice(G);
    const n = await P.addPracticeAssignment({ title: "CN Assignment 2", course: "CN", dueDate: null, dueTime: null });
    await db.tasks.delete(`lms-assign-${n}`);
    expect(await P.ensurePracticeFromSolution({ instance: n })).toBe(true);
    expect(await P.ensurePracticeFromSolution({ instance: 41 })).toBe(false);
  });

  it("turning it off takes the practice assignments out of Tasks; a real LMS sync never ticks them", async () => {
    await P.startPractice(G);
    resetImportMemo();
    await importLms({ lms: { connected: true, syncedAt: Date.now(), items: [] } } as never);
    expect((await db.tasks.filter((t) => P.isPracticeTask(t.id) && t.done).count())).toBe(0);
    await P.stopPractice();
    expect(P.practiceOn()).toBe(false);
    expect(await practiceIds()).toEqual([]);
    await expect(submitToLms(900500, pdf, "a.pdf")).rejects.toThrow(/Practice LMS is off/);
  });
});
