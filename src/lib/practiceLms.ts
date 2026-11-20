/**
 * A pretend LMS for trying the solution feature safely.
 *
 * Switched on in Settings, it adds three practice assignments to Tasks (ids
 * "lms-assign-9001xx", the same on every phone, so friends who switch it on
 * match each other's solutions). Submitting to one never leaves the phone: the
 * file is kept here so you can open it and check whose name is inside, and the
 * next answer can be set to fail, stay a draft, or refuse like a website-only
 * login, to try every screen. The real LMS is never called for these.
 */

import { useSyncExternalStore } from "react";
import { db } from "./db";
import type { Task } from "./types";

const KEY = "dockin-practice-lms";
const NEXT = "dockin-practice-next";
export const PRACTICE_FROM = 900100;

export const PRACTICE: { instance: number; title: string; course: string; days: number }[] = [
  { instance: 900101, title: "DBMS Assignment 4 (practice)", course: "Database Management Systems", days: 3 },
  { instance: 900102, title: "OS Lab 3 (practice)", course: "Operating Systems", days: 5 },
  { instance: 900103, title: "Maths Tutorial 5 (practice)", course: "Discrete Mathematics", days: 1 },
];

export const isPractice = (instance: number | null | undefined) => instance !== null && instance !== undefined && instance > PRACTICE_FROM && instance < PRACTICE_FROM + 100;
export const isPracticeTask = (id: string) => /^lms-assign-9001\d\d$/.test(id);

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

const dateIn = (days: number, now: number) => {
  const d = new Date(now + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Switches the practice LMS on: its assignments appear in Tasks, not yet submitted. */
export async function startPractice(now = Date.now()): Promise<void> {
  for (const p of PRACTICE) {
    const id = `lms-assign-${p.instance}`;
    const have = await db.tasks.get(id);
    const task: Task = {
      id,
      title: p.title,
      notes: p.course,
      kind: "assignment",
      subjectId: null,
      dueDate: dateIn(p.days, now),
      dueTime: "23:59",
      room: "",
      priority: "med",
      done: false,
      doneAt: null,
      subtasks: [],
      source: "lms",
      createdAt: have?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.tasks.put(task);
  }
  write(KEY, "1");
}

/** Switches it off: the practice assignments and their kept files go. */
export async function stopPractice(now = Date.now()): Promise<void> {
  for (const p of PRACTICE) {
    const id = `lms-assign-${p.instance}`;
    if (await db.tasks.get(id)) await db.tasks.update(id, { deletedAt: now, updatedAt: now });
  }
  await db.practiceSubs.clear();
  write(KEY, null);
  write(NEXT, null);
}

/** Start again: nothing submitted, every practice assignment open. */
export async function resetPractice(now = Date.now()): Promise<void> {
  await db.practiceSubs.clear();
  await startPractice(now);
}

export class PracticeError extends Error {}

/**
 * What the pretend LMS does with a submission: waits like a real upload, then
 * answers as set in Settings. On "ok" it keeps the file and says "submitted".
 */
export async function practiceSubmit(instance: number, blob: Blob, name: string): Promise<"submitted" | "draft" | "webonly"> {
  await new Promise((r) => setTimeout(r, 1400));
  const answer = nextAnswer();
  if (answer !== "ok") setNextAnswer("ok"); // one bad answer, then back to normal
  if (answer === "fail") throw new PracticeError("Practice LMS: the upload failed (pretend network error). Nothing was handed in.");
  if (answer === "webonly") return "webonly";
  await db.practiceSubs.put({ instance, name, blob, size: blob.size, at: Date.now(), status: answer === "draft" ? "draft" : "submitted" });
  return answer === "draft" ? "draft" : "submitted";
}
