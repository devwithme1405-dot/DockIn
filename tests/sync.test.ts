import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addExpense, addSubject, addTask, deleteTask, resetAll, saveProfile, updateTask } from "@/lib/repo";
import { SYNC_KINDS, clearSyncState, resetSyncStatus, syncOnce, type Remote, type RemoteRow } from "@/lib/sync";

// localStorage is not available in the node test environment
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;

/** In-memory stand-in for the Supabase table, with the same "newer wins" rule. */
class FakeRemote implements Remote {
  rows = new Map<string, RemoteRow>();
  pushes = 0;
  tick = 0;
  async pull(since: string | null, limit: number) {
    return [...this.rows.values()]
      .filter((r) => !since || (r.synced_at as string) > since)
      .sort((a, b) => (a.synced_at as string).localeCompare(b.synced_at as string))
      .slice(0, limit);
  }
  async push(rows: RemoteRow[]) {
    this.pushes += rows.length;
    for (const r of rows) {
      const key = `${r.kind}/${r.id}`;
      const old = this.rows.get(key);
      if (old && r.updated_at <= old.updated_at) continue;
      this.tick += 1;
      this.rows.set(key, { ...r, synced_at: new Date(1_700_000_000_000 + this.tick * 1000).toISOString() });
    }
  }
}

interface Snapshot {
  tables: Record<string, Record<string, unknown>[]>;
  state: string | null;
}
async function snapshot(): Promise<Snapshot> {
  const tables: Snapshot["tables"] = {};
  for (const k of SYNC_KINDS) tables[k] = await db.table(k).toArray();
  return { tables, state: store.get("dockin-sync") ?? null };
}
async function restore(s: Snapshot) {
  await resetAll();
  for (const k of SYNC_KINDS) if (s.tables[k].length) await db.table(k).bulkPut(s.tables[k]);
  if (s.state) store.set("dockin-sync", s.state);
  else store.delete("dockin-sync");
}
const emptyPhone = (): Snapshot => ({ tables: Object.fromEntries(SYNC_KINDS.map((k) => [k, []])), state: null });

beforeEach(async () => {
  await resetAll();
  clearSyncState();
  resetSyncStatus();
});

describe("sync", () => {
  it("uploads everything the first time a phone signs in", async () => {
    await saveProfile({ name: "Sachin", onboarded: true });
    const sub = await addSubject({ name: "Data Structures", code: "DSA" });
    await addTask({ title: "Lab record", subjectId: sub.id });
    await addExpense({ amount: 50, category: "food", date: "2026-10-02" });
    const remote = new FakeRemote();
    await syncOnce(remote, "u1");
    expect([...remote.rows.keys()].sort()).toEqual(
      expect.arrayContaining(["profile/me", `subjects/${sub.id}`]),
    );
    expect(remote.rows.size).toBe(4);
  });

  it("restores the account on a fresh phone", async () => {
    const remote = new FakeRemote();
    await addSubject({ name: "DBMS", code: "DBMS" });
    await addTask({ title: "Assignment 3" });
    await syncOnce(remote, "u1");

    await restore(emptyPhone());
    await syncOnce(remote, "u1");
    expect((await db.tasks.toArray())[0].title).toBe("Assignment 3");
    expect(await db.subjects.count()).toBe(1);
  });

  it("only pushes what changed since the last sync", async () => {
    const remote = new FakeRemote();
    const t = await addTask({ title: "One" });
    await addTask({ title: "Two" });
    await syncOnce(remote, "u1");
    const first = remote.pushes;
    await syncOnce(remote, "u1");
    expect(remote.pushes).toBe(first); // nothing new
    await new Promise((r) => setTimeout(r, 5));
    await updateTask(t.id, { title: "One (edited)" });
    await syncOnce(remote, "u1");
    expect(remote.pushes).toBe(first + 1);
  });

  it("keeps the newest edit when two phones disagree", async () => {
    const remote = new FakeRemote();
    const t = await addTask({ title: "Original" });
    await syncOnce(remote, "u1");
    const phoneA = await snapshot();

    // phone B (a copy) edits later
    await new Promise((r) => setTimeout(r, 5));
    await updateTask(t.id, { title: "Edited on B" });
    await syncOnce(remote, "u1");

    // phone A, still on the old copy, edits earlier than B and syncs afterwards
    await restore(phoneA);
    await db.tasks.update(t.id, { title: "Stale on A", updatedAt: (await db.tasks.get(t.id))!.updatedAt + 1 });
    await syncOnce(remote, "u1");
    expect((await db.tasks.get(t.id))?.title).toBe("Edited on B");
    expect(remote.rows.get(`tasks/${t.id}`)?.data.title).toBe("Edited on B");
  });

  it("carries deletions to other phones", async () => {
    const remote = new FakeRemote();
    const t = await addTask({ title: "Remove me" });
    await syncOnce(remote, "u1");
    const other = await snapshot();
    await new Promise((r) => setTimeout(r, 5));
    await deleteTask(t.id);
    await syncOnce(remote, "u1");
    await restore(other);
    await syncOnce(remote, "u1");
    expect((await db.tasks.get(t.id))?.deletedAt).toBeTruthy();
  });

  it("never mixes in another student's data on a shared phone", async () => {
    const remote = new FakeRemote();
    await addTask({ title: "Student one's task" });
    await syncOnce(remote, "u1");
    await syncOnce(new FakeRemote(), "u2"); // a different, empty account signs in
    expect(await db.tasks.count()).toBe(0);
  });

  it("pulls more than one page", async () => {
    const remote = new FakeRemote();
    for (let i = 0; i < 1500; i++) {
      remote.rows.set(`expenses/e${i}`, {
        kind: "expenses",
        id: `e${i}`,
        updated_at: 1000 + i,
        deleted_at: null,
        data: { amount: 1, category: "food", note: "", date: "2026-10-01", createdAt: 1, deletedAt: null },
        synced_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
      });
    }
    await syncOnce(remote, "u1");
    expect(await db.expenses.count()).toBe(1500);
  });

  it("reports an error and keeps local data when the network fails", async () => {
    const bad: Remote = {
      pull: async () => {
        throw new Error("offline");
      },
      push: async () => {},
    };
    await addTask({ title: "Still here" });
    await syncOnce(bad, "u1");
    const { getSyncStatus } = await import("@/lib/sync");
    expect(getSyncStatus().state).toBe("error");
    expect(await db.tasks.count()).toBe(1);
  });
});
