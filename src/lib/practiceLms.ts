/**
 * A pretend LMS for trying the solution feature safely.
 *
 * Switched on from Settings (its own page, /practice-lms), it adds practice
 * assignments to Tasks — three to start with, and any you add yourself. Their
 * ids ("lms-assign-9xxxxx") travel with a solution, so a friend with practice
 * on gets the same assignment automatically. Submitting to one never leaves
 * the phone: every try is logged and the handed-in file is kept, so you can
 * open it and check whose name is inside. The next answer can be set to fail,
 * stay a draft, or refuse like a website-only login, to see every result. The
 * real LMS is never called for these.
 */

import { useSyncExternalStore } from "react";
import { db } from "./db";
import type { Task } from "./types";

const KEY = "dockin-practice-lms";
const NEXT = "dockin-practice-next";
export const PRACTICE_FROM = 900100;
const PRACTICE_TO = 999999;

export const PRACTICE: { instance: number; title: string; course: string; days: number }[] = [
  { instance: 900101, title: "DBMS Assignment 4 (practice)", course: "Database Management Systems", days: 3 },
  { instance: 900102, title: "OS Lab 3 (practice)", course: "Operating Systems", days: 5 },
  { instance: 900103, title: "Maths Tutorial 5 (practice)", course: "Discrete Mathematics", days: 1 },
];

export const isPractice = (instance: number | null | undefined): instance is number =>
  typeof instance === "number" && instance > PRACTICE_FROM && instance <= PRACTICE_TO;
export const isPracticeTask = (id: string) => {
  const m = id.match(/^lms-assign-(\d+)$/);
  return !!m && isPractice(Number(m[1]));
};
export const practiceTaskId = (instance: number) => `lms-assign-${instance}`;

export type NextAnswer = "ok" | "fail" | "draft" | "webonly";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private window: practice simply stays off.
  }
  emit();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function practiceOn(): boolean {
  return read(KEY) === "1";
}
export function usePracticeOn(): boolean {
  return useSyncExternalStore(subscribe, practiceOn, () => false);
}
export function nextAnswer(): NextAnswer {
  const v = read(NEXT);
  return v === "fail" || v === "draft" || v === "webonly" ? v : "ok";
}
export function useNextAnswer(): NextAnswer {
  return useSyncExternalStore(subscribe, nextAnswer, () => "ok" as NextAnswer);
}
export function setNextAnswer(a: NextAnswer) {
  write(NEXT, a === "ok" ? null : a);
}

export const dateIn = (days: number, now = Date.now()) => {
  const d = new Date(now + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function putAssignment(
  a: { instance: number; title: string; course: string; dueDate: string | null; dueTime: string | null },
  now: number,
): Promise<void> {
  const id = practiceTaskId(a.instance);
  const have = await db.tasks.get(id);
  const task: Task = {
    id,
    title: a.title.trim().slice(0, 140) || "Practice assignment",
    notes: a.course.trim().slice(0, 80),
    kind: "assignment",
    subjectId: null,
    dueDate: a.dueDate,
    dueTime: a.dueDate ? (a.dueTime ?? "23:59") : null,
    room: "",
    priority: "med",
    done: have && !have.deletedAt ? have.done : false,
    doneAt: have && !have.deletedAt ? have.doneAt : null,
    subtasks: [],
    source: "lms",
    url: "/practice-lms",
    createdAt: have?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.tasks.put(task);
}

/** Switches the practice LMS on: its starter assignments appear in Tasks. */
export async function startPractice(now = Date.now()): Promise<void> {
  for (const p of PRACTICE) {
    const have = await db.tasks.get(practiceTaskId(p.instance));
    if (have && !have.deletedAt) continue;
    await putAssignment({ ...p, dueDate: dateIn(p.days, now), dueTime: "23:59" }, now);
  }
  write(KEY, "1");
}

/** All practice assignments currently in Tasks. */
export async function practiceTasks(): Promise<Task[]> {
  return db.tasks.filter((t) => isPracticeTask(t.id) && !t.deletedAt).toArray();
}

/** Switches it off: every practice assignment and everything handed in goes. */
export async function stopPractice(now = Date.now()): Promise<void> {
  for (const t of await practiceTasks()) await db.tasks.update(t.id, { deletedAt: now, updatedAt: now });
  await db.practiceSubs.clear();
  await db.practiceAttempts.clear();
  write(KEY, null);
  write(NEXT, null);
}

/** Start again: nothing handed in, every practice assignment open. */
export async function resetPractice(now = Date.now()): Promise<void> {
  await db.practiceSubs.clear();
  await db.practiceAttempts.clear();
  for (const t of await practiceTasks()) await db.tasks.update(t.id, { done: false, doneAt: null, updatedAt: now });
  await startPractice(now);
}

/** A new assignment on the practice LMS; it shows up in Tasks like a real one. */
export async function addPracticeAssignment(
  a: { title: string; course: string; dueDate: string | null; dueTime: string | null },
  now = Date.now(),
): Promise<number> {
  let instance = 0;
  for (let i = 0; i < 20; i++) {
    const n = 901000 + Math.floor(Math.random() * (PRACTICE_TO - 901000));
    if (!(await db.tasks.get(practiceTaskId(n)))) {
      instance = n;
      break;
    }
  }
  if (!instance) throw new Error("Could not make the assignment. Try again.");
  await putAssignment({ instance, ...a }, now);
  if (!practiceOn()) write(KEY, "1");
  return instance;
}

export async function removePracticeAssignment(instance: number, now = Date.now()): Promise<void> {
  const id = practiceTaskId(instance);
  if (await db.tasks.get(id)) await db.tasks.update(id, { deletedAt: now, updatedAt: now });
  await db.practiceSubs.delete(instance);
  await db.practiceAttempts.where("instance").equals(instance).delete();
}

/**
 * A friend sent a solution for a practice assignment this phone does not have
 * yet: add it, so it can be submitted here too. Only while practice is on.
 */
export async function ensurePracticeFromSolution(
  sol: { instance: number | null; title: string; course?: string | null; dueDate?: string | null; dueTime?: string | null },
  now = Date.now(),
): Promise<boolean> {
  if (!practiceOn() || !isPractice(sol.instance)) return false;
  const have = await db.tasks.get(practiceTaskId(sol.instance));
  if (have && !have.deletedAt) return false;
  await putAssignment(
    { instance: sol.instance, title: sol.title, course: sol.course ?? "", dueDate: sol.dueDate ?? null, dueTime: sol.dueTime ?? null },
    now,
  );
  return true;
}

export class PracticeError extends Error {}

/**
 * What the pretend LMS does with a submission: waits like a real upload, logs
 * the try, then answers as set. On "ok" it keeps the file and says "submitted".
 */
export async function practiceSubmit(instance: number, blob: Blob, name: string): Promise<"submitted" | "draft" | "webonly"> {
  await new Promise((r) => setTimeout(r, 1400));
  const answer = nextAnswer();
  if (answer !== "ok") setNextAnswer("ok"); // one bad answer, then back to normal
  const at = Date.now();
  const log = (status: "submitted" | "draft" | "failed" | "refused") =>
    db.practiceAttempts.add({ instance, name, size: blob.size, at, status, ...(status === "submitted" || status === "draft" ? { blob } : {}) });
  if (answer === "fail") {
    await log("failed");
    throw new PracticeError("Practice LMS: the upload failed (pretend network error). Nothing was handed in.");
  }
  if (answer === "webonly") {
    await log("refused");
    return "webonly";
  }
  const status = answer === "draft" ? "draft" : "submitted";
  await log(status);
  await db.practiceSubs.put({ instance, name, blob, size: blob.size, at, status });
  return status;
}
