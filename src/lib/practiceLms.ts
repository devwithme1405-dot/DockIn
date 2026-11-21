/**
 * The Practice LMS is gone: assignments now only ever go to the real LMS.
 *
 * This file only tidies up what the practice version left on a phone — its
 * pretend assignments in Tasks (instances 900101–999999) and its settings —
 * so nobody is left with a task that can never be handed in.
 */

import { db } from "./db";

const PRACTICE_FROM = 900100;
const PRACTICE_TO = 999999;
const KEYS = ["dockin-practice-group", "dockin-practice-lms", "dockin-practice-next"];
const DONE = "dockin-practice-retired";

export const isPractice = (instance: number | null | undefined): instance is number =>
  typeof instance === "number" && instance > PRACTICE_FROM && instance <= PRACTICE_TO;

export const isPracticeTask = (id: string) => {
  const m = id.match(/^lms-assign-(\d+)$/);
  return !!m && isPractice(Number(m[1]));
};

/** Once per phone: drop the practice assignments and settings. Safe to call often. */
export async function retirePractice(now = Date.now()): Promise<number> {
  try {
    if (localStorage.getItem(DONE) === "1") return 0;
  } catch {
    // No storage: just run the (cheap) clean-up.
  }
  const stale = await db.tasks.filter((t) => isPracticeTask(t.id) && !t.deletedAt).toArray();
  for (const t of stale) await db.tasks.update(t.id, { deletedAt: now, updatedAt: now });
  try {
    for (const k of KEYS) localStorage.removeItem(k);
    localStorage.setItem(DONE, "1");
  } catch {
    // ignore
  }
  return stale.length;
}
