/**
 * The bell's read marks, kept on the phone.
 *
 * The notifications in the bell are worked out fresh every time from attendance,
 * tasks and the like — they have no row in any table. So "read" cannot live on
 * them; it lives here, as a small set of keys in local storage. Closing and
 * reopening the sheet, or the whole app, keeps what you marked read.
 *
 * Each key carries a signature of the alert's state (the rounded percentage, the
 * count, the date). Mark "72% — careful" read and it stays read; the day it
 * slips to 68% the key changes and it rings again. Keys for alerts that have
 * since cleared are pruned, so the set never grows without bound.
 */
const KEY = "dockin-bell-read-v1";

export function loadReadKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function persist(keys: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...keys]));
  } catch {}
}

/**
 * Keep only the read marks whose alert is still showing, then save. Returns the
 * pruned set so the caller can use it as its starting point.
 */
export function pruneReadKeys(present: readonly string[]): Set<string> {
  const here = new Set(present);
  const kept = new Set([...loadReadKeys()].filter((k) => here.has(k)));
  persist(kept);
  return kept;
}

export function saveReadKeys(keys: Set<string>): void {
  persist(keys);
}
