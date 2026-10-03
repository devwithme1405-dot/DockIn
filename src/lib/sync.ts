import { db } from "./db";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Offline-first sync.
 *
 * The phone's IndexedDB stays the source of truth for the UI. Changes are
 * pushed to Supabase in the background and other devices' changes are pulled
 * in. When two devices edit the same record, the later `updatedAt` wins.
 */

export const SYNC_KINDS = ["profile", "subjects", "slots", "sessions", "expenses", "tasks", "events", "shareState", "categories"] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

export interface RemoteRow {
  kind: SyncKind;
  id: string;
  updated_at: number;
  deleted_at: number | null;
  data: Record<string, unknown>;
  synced_at?: string;
}

export interface Remote {
  /** Rows changed on the server after `since` (ISO time), oldest first, at most `limit`. */
  pull(since: string | null, limit: number): Promise<RemoteRow[]>;
  push(rows: RemoteRow[]): Promise<void>;
}

interface Stored {
  userId: string;
  lastPull: string | null;
  lastPushed: number;
}

const KEY = "dockin-sync";
const OVERLAP_MS = 5000; // re-read a little of the past so a late commit is never missed
const PAGE = 1000;
const CHUNK = 300;

// ---------- small persisted state ----------

export function loadState(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function saveState(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
export function clearSyncState() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

// ---------- status store ----------

export interface SyncStatus {
  state: "idle" | "syncing" | "error";
  /** True once the first sync after sign-in has finished (or failed). */
  ready: boolean;
  last: number | null;
  error: string | null;
}
let status: SyncStatus = { state: "idle", ready: false, last: null, error: null };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export const getSyncStatus = () => status;
export function subscribeSync(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function resetSyncStatus() {
  status = { state: "idle", ready: false, last: null, error: null };
  listeners.forEach((l) => l());
}

// ---------- the sync itself ----------

let applyingRemote = false;
export const isApplyingRemote = () => applyingRemote;

type AnyTable = {
  filter(fn: (r: Record<string, unknown>) => boolean): { toArray(): Promise<Record<string, unknown>[]> };
  bulkGet(keys: string[]): Promise<(Record<string, unknown> | undefined)[]>;
  bulkPut(rows: Record<string, unknown>[]): Promise<unknown>;
  count(): Promise<number>;
  clear(): Promise<void>;
};
const table = (k: SyncKind) => db.table(k) as unknown as AnyTable;

async function localHasData(): Promise<boolean> {
  for (const k of SYNC_KINDS) if ((await table(k).count()) > 0) return true;
  return false;
}

async function pushAll(remote: Remote, lastPushed: number): Promise<number> {
  let max = lastPushed;
  for (const kind of SYNC_KINDS) {
    const rows = await table(kind)
      .filter((r) => Number(r.updatedAt ?? 0) > lastPushed)
      .toArray();
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((r) => ({
        kind,
        id: String(r.id),
        updated_at: Number(r.updatedAt),
        deleted_at: (r.deletedAt as number | null | undefined) ?? null,
        data: r,
      }));
      await remote.push(batch);
      for (const b of batch) if (b.updated_at > max) max = b.updated_at;
    }
  }
  return max;
}

async function pullAll(remote: Remote, lastPull: string | null): Promise<string | null> {
  let since = lastPull ? new Date(new Date(lastPull).getTime() - OVERLAP_MS).toISOString() : null;
  let newest = lastPull;
  for (;;) {
    const rows = await remote.pull(since, PAGE);
    if (rows.length === 0) break;
    applyingRemote = true;
    try {
      for (const kind of SYNC_KINDS) {
        const mine = rows.filter((r) => r.kind === kind);
        if (mine.length === 0) continue;
        const local = await table(kind).bulkGet(mine.map((r) => r.id));
        const toWrite: Record<string, unknown>[] = [];
        mine.forEach((r, i) => {
          const have = local[i];
          if (!have || Number(have.updatedAt ?? 0) < r.updated_at) {
            toWrite.push({ ...r.data, id: r.id, updatedAt: r.updated_at, deletedAt: r.deleted_at });
          }
        });
        if (toWrite.length) await table(kind).bulkPut(toWrite);
      }
    } finally {
      applyingRemote = false;
    }
    const lastSeen = rows[rows.length - 1].synced_at ?? null;
    if (lastSeen && (!newest || lastSeen > newest)) newest = lastSeen;
    if (rows.length < PAGE || !lastSeen) break;
    since = lastSeen;
  }
  return newest;
}

let running: Promise<void> | null = null;

/**
 * One full round: pull first (so a new phone gets the account's data),
 * then push local changes. Safe to call often; overlapping calls share one run.
 */
export function syncOnce(remote: Remote, userId: string): Promise<void> {
  if (running) return running;
  running = (async () => {
    setStatus({ state: "syncing", error: null });
    try {
      let st = loadState();
      if (st && st.userId !== userId) {
        // A different student used this phone before: never mix their data.
        for (const k of SYNC_KINDS) await table(k).clear();
        st = null;
      }
      const state: Stored = st ?? { userId, lastPull: null, lastPushed: 0 };
      const hadLocal = !st && (await localHasData());
      state.lastPull = await pullAll(remote, state.lastPull);
      saveState(state);
      // On the first link of a phone that already has data, upload all of it.
      state.lastPushed = await pushAll(remote, hadLocal ? 0 : state.lastPushed);
      saveState(state);
      setStatus({ state: "idle", ready: true, last: Date.now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      setStatus({ state: "error", ready: true, error: msg });
    } finally {
      running = null;
    }
  })();
  return running;
}

// ---------- Supabase transport ----------

export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async pull(since, limit) {
      let q = client
        .from("sync_records")
        .select("kind,id,updated_at,deleted_at,data,synced_at")
        .order("synced_at", { ascending: true })
        .limit(limit);
      if (since) q = q.gt("synced_at", since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as RemoteRow[];
    },
    async push(rows) {
      const { error } = await client
        .from("sync_records")
        .upsert(
          rows.map((r) => ({ ...r, user_id: userId })),
          { onConflict: "user_id,kind,id" },
        );
      if (error) throw new Error(error.message);
    },
  };
}

// ---------- when to sync ----------

let hooksInstalled = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let trigger: (() => void) | null = null;

/** Run `fn` a few seconds after the last local change. */
function scheduleSync() {
  if (isApplyingRemote() || !trigger) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => trigger?.(), 3000);
}

export function installChangeHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  for (const kind of SYNC_KINDS) {
    const t = db.table(kind);
    t.hook("creating", () => {
      scheduleSync();
    });
    t.hook("updating", () => {
      scheduleSync();
      return undefined;
    });
    t.hook("deleting", () => {
      scheduleSync();
    });
  }
}

/** Start background syncing for a signed-in user. Returns a stop function. */
export function startSync(client: SupabaseClient, userId: string): () => void {
  installChangeHooks();
  const remote = supabaseRemote(client, userId);
  const run = () => {
    void syncOnce(remote, userId);
  };
  trigger = run;
  run();
  const onVisible = () => document.visibilityState === "visible" && run();
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", onVisible);
  const interval = setInterval(run, 5 * 60_000);
  return () => {
    trigger = null;
    if (timer) clearTimeout(timer);
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(interval);
  };
}

/** Push everything pending right now (used before signing out). */
export async function flushNow(client: SupabaseClient, userId: string): Promise<boolean> {
  const remote = supabaseRemote(client, userId);
  await syncOnce(remote, userId); // finish any run already in flight
  await syncOnce(remote, userId); // then one that sees the very latest edits
  return getSyncStatus().state !== "error";
}
