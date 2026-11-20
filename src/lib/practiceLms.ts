/**
 * A pretend LMS for trying the solution feature safely — shared by one group.
 *
 * Switched on from /practice-lms (Settings → Practice LMS) for one of your
 * groups. Everyone in that group who switches it on gets the same practice
 * assignments in Tasks; anyone can add more. Submitting to one never touches
 * the real LMS: the file goes to the group's own storage and a row in
 * practice_submissions, which every member can see — so one person can keep
 * the page open on a laptop and watch each phone's submission land, like a
 * teacher. The next answer can be set to fail, stay a draft, or refuse like a
 * website-only login, to try every result screen.
 */

import { useSyncExternalStore } from "react";
import { db } from "./db";
import type { Task } from "./types";
import { getSupabase } from "./supabase";

const KEY = "dockin-practice-group";
const OLD_KEY = "dockin-practice-lms";
const NEXT = "dockin-practice-next";
export const PRACTICE_FROM = 900100;
const PRACTICE_TO = 999999;

/** What a new practice LMS starts with. */
export const STARTERS: { title: string; course: string; days: number }[] = [
  { title: "DBMS Assignment 4 (practice)", course: "Database Management Systems", days: 3 },
  { title: "OS Lab 3 (practice)", course: "Operating Systems", days: 5 },
  { title: "Maths Tutorial 5 (practice)", course: "Discrete Mathematics", days: 1 },
];

export const isPractice = (instance: number | null | undefined): instance is number =>
  typeof instance === "number" && instance > PRACTICE_FROM && instance <= PRACTICE_TO;
export const isPracticeTask = (id: string) => {
  const m = id.match(/^lms-assign-(\d+)$/);
  return !!m && isPractice(Number(m[1]));
};
export const practiceTaskId = (instance: number) => `lms-assign-${instance}`;

export type NextAnswer = "ok" | "fail" | "draft" | "webonly";

export interface PracticeAssignment {
  instance: number;
  title: string;
  course: string;
  dueAt: number | null;
  createdBy: string;
}

export interface PracticeSubmission {
  id: string;
  instance: number;
  userId: string;
  name: string;
  size: number;
  path: string | null;
  status: "submitted" | "draft" | "failed" | "refused";
  at: number;
}

export class PracticeError extends Error {}

// ---------------------------------------------------------------------------
// Which group, and how the next submit answers (this device only)

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

export function practiceGroup(): string | null {
  return read(KEY);
}
export function usePracticeGroup(): string | null {
  return useSyncExternalStore(subscribe, practiceGroup, () => null);
}
export function practiceOn(): boolean {
  return !!practiceGroup();
}
export function usePracticeOn(): boolean {
  return !!usePracticeGroup();
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

// ---------------------------------------------------------------------------
// Server

async function client() {
  const sb = getSupabase();
  if (!sb) throw new PracticeError("Practice LMS needs DockIn's cloud — sign in first.");
  const { data } = await sb.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new PracticeError("Sign in to use Practice LMS.");
  return { sb, me };
}

function problem(e: { message?: string; code?: string } | null, what: string): PracticeError {
  const msg = e?.message ?? "";
  if (/practice_(assignments|submissions)|schema cache|does not exist/i.test(msg)) {
    return new PracticeError("Practice LMS isn't set up on the server yet — run migration 0022 in Supabase.");
  }
  if (/Failed to fetch|NetworkError/i.test(msg)) return new PracticeError("No internet — Practice LMS is online, like the real one.");
  return new PracticeError(`${what}: ${msg || "something went wrong"}`);
}

const toAssignment = (r: Record<string, unknown>): PracticeAssignment => ({
  instance: Number(r.instance),
  title: String(r.title),
  course: String(r.course ?? ""),
  dueAt: r.due_at ? new Date(String(r.due_at)).getTime() : null,
  createdBy: String(r.created_by),
});
const toSubmission = (r: Record<string, unknown>): PracticeSubmission => ({
  id: String(r.id),
  instance: Number(r.instance),
  userId: String(r.user_id),
  name: String(r.name),
  size: Number(r.size ?? 0),
  path: (r.path as string | null) ?? null,
  status: r.status as PracticeSubmission["status"],
  at: new Date(String(r.created_at)).getTime(),
});

export async function fetchAssignments(group: string): Promise<PracticeAssignment[]> {
  const { sb } = await client();
  const { data, error } = await sb.from("practice_assignments").select("instance,title,course,due_at,created_by").eq("group_id", group);
  if (error) throw problem(error, "Could not load the assignments");
  return (data ?? []).map(toAssignment);
}

export async function fetchSubmissions(group: string): Promise<PracticeSubmission[]> {
  const { sb } = await client();
  const { data, error } = await sb
    .from("practice_submissions")
    .select("id,instance,user_id,name,size,path,status,created_at")
    .eq("group_id", group)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw problem(error, "Could not load the submissions");
  return (data ?? []).map(toSubmission);
}

const localDate = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
};

/**
 * Brings this phone's Tasks in line with the group's practice LMS: every
 * assignment there is a task, ticked when I have submitted it; practice tasks
 * the LMS no longer has go away.
 */
export async function pullPractice(now = Date.now()): Promise<void> {
  const group = practiceGroup();
  if (!group) return;
  const { me } = await client();
  const [list, subs] = await Promise.all([fetchAssignments(group), fetchSubmissions(group)]);
  const handedIn = new Map<number, number>();
  for (const s of subs) if (s.userId === me && s.status === "submitted") handedIn.set(s.instance, s.at);
  const keep = new Set<string>();
  for (const a of list) {
    const id = practiceTaskId(a.instance);
    keep.add(id);
    const have = await db.tasks.get(id);
    const due = a.dueAt ? localDate(a.dueAt) : null;
    const doneAt = handedIn.get(a.instance) ?? null;
    const task: Task = {
      id,
      title: a.title,
      notes: a.course,
      kind: "assignment",
      subjectId: null,
      dueDate: due?.date ?? null,
      dueTime: due?.time ?? null,
      room: "",
      priority: "med",
      done: doneAt !== null,
      doneAt,
      subtasks: [],
      source: "lms",
      url: "/practice-lms",
      createdAt: have?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    const same =
      have &&
      !have.deletedAt &&
      have.title === task.title &&
      have.notes === task.notes &&
      have.dueDate === task.dueDate &&
      have.dueTime === task.dueTime &&
      have.done === task.done;
    if (!same) await db.tasks.put(task);
  }
  const stale = await db.tasks.filter((t) => isPracticeTask(t.id) && !t.deletedAt && !keep.has(t.id)).toArray();
  for (const t of stale) await db.tasks.update(t.id, { deletedAt: now, updatedAt: now });
}

function freeInstance(taken: Set<number>): number {
  for (let i = 0; i < 50; i++) {
    const n = 901000 + Math.floor(Math.random() * (PRACTICE_TO - 901000));
    if (!taken.has(n)) return n;
  }
  throw new PracticeError("Could not make the assignment. Try again.");
}

/** A new assignment on the group's practice LMS; it shows up in everyone's Tasks. */
export async function addPracticeAssignment(
  a: { title: string; course: string; dueDate: string | null; dueTime: string | null },
  group = practiceGroup(),
): Promise<number> {
  if (!group) throw new PracticeError("Turn Practice LMS on for a group first.");
  const { sb, me } = await client();
  const taken = new Set((await fetchAssignments(group)).map((x) => x.instance));
  const instance = freeInstance(taken);
  const due = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || "23:59"}:00`).toISOString() : null;
  const { error } = await sb.from("practice_assignments").insert({
    group_id: group,
    instance,
    title: a.title.trim().slice(0, 140) || "Practice assignment",
    course: a.course.trim().slice(0, 80),
    due_at: due,
    created_by: me,
  });
  if (error) throw problem(error, "Could not add it");
  await pullPractice();
  return instance;
}

export async function removePracticeAssignment(instance: number): Promise<void> {
  const group = practiceGroup();
  if (!group) return;
  const { sb } = await client();
  const { error } = await sb.from("practice_assignments").delete().eq("group_id", group).eq("instance", instance);
  if (error) throw problem(error, "Could not remove it");
  await pullPractice();
}

/** Switches Practice LMS on for a group; a brand-new one gets three starter assignments. */
export async function startPractice(group: string, now = Date.now()): Promise<void> {
  const { sb, me } = await client();
  const list = await fetchAssignments(group);
  if (list.length === 0) {
    const taken = new Set<number>();
    const rows = STARTERS.map((s) => {
      const instance = freeInstance(taken);
      taken.add(instance);
      const d = new Date(now + s.days * 86_400_000);
      d.setHours(23, 59, 0, 0);
      return { group_id: group, instance, title: s.title, course: s.course, due_at: d.toISOString(), created_by: me };
    });
    const { error } = await sb.from("practice_assignments").insert(rows);
    if (error) throw problem(error, "Could not set up Practice LMS");
  }
  write(KEY, group);
  write(OLD_KEY, null);
  await pullPractice(now);
}

/** Switches it off on this phone: the practice assignments leave Tasks. */
export async function stopPractice(now = Date.now()): Promise<void> {
  const stale = await db.tasks.filter((t) => isPracticeTask(t.id) && !t.deletedAt).toArray();
  for (const t of stale) await db.tasks.update(t.id, { deletedAt: now, updatedAt: now });
  write(KEY, null);
  write(OLD_KEY, null);
  write(NEXT, null);
}

/** Start again: every submission in the group is cleared, for everyone. */
export async function resetPractice(): Promise<void> {
  const group = practiceGroup();
  if (!group) return;
  const { sb, me } = await client();
  const mine = (await fetchSubmissions(group)).filter((s) => s.userId === me && s.path).map((s) => s.path!);
  if (mine.length) await sb.storage.from("chat-files").remove(mine);
  const { error } = await sb.from("practice_submissions").delete().eq("group_id", group);
  if (error) throw problem(error, "Could not clear it");
  await pullPractice();
}

/**
 * A friend sent a solution for a practice assignment this phone does not have
 * yet: fetch the group's list, which has it if we share the practice group.
 */
export async function ensurePracticeFromSolution(sol: { instance: number | null }): Promise<boolean> {
  if (!practiceOn() || !isPractice(sol.instance)) return false;
  const have = await db.tasks.get(practiceTaskId(sol.instance));
  if (have && !have.deletedAt) return false;
  await pullPractice().catch(() => {});
  const now = await db.tasks.get(practiceTaskId(sol.instance));
  return !!now && !now.deletedAt;
}

export async function openPracticeFile(path: string): Promise<Blob> {
  const { sb } = await client();
  const { data, error } = await sb.storage.from("chat-files").download(path);
  if (error || !data) throw new PracticeError("That file is no longer there.");
  return data;
}

/**
 * What the pretend LMS does with a submission: uploads it to the group's
 * practice storage and logs it for everyone to see — or, when set to, fails,
 * keeps it as a draft, or refuses like a website-only login.
 */
export async function practiceSubmit(instance: number, blob: Blob, name: string): Promise<"submitted" | "draft" | "webonly"> {
  const group = practiceGroup();
  if (!group) throw new PracticeError("Practice LMS is off on this phone. Turn it on in Settings → Practice LMS.");
  const { sb, me } = await client();
  const answer = nextAnswer();
  if (answer !== "ok") setNextAnswer("ok"); // one bad answer, then back to normal
  const clean = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, " ").trim().slice(-80) || "submission";
  const log = async (status: PracticeSubmission["status"], path: string | null) => {
    const { error } = await sb.from("practice_submissions").insert({ group_id: group, instance, user_id: me, name: clean, size: blob.size, path, status });
    if (error) throw problem(error, "The practice LMS did not record it");
  };
  await new Promise((r) => setTimeout(r, 900));
  if (answer === "fail") {
    await log("failed", null).catch(() => {});
    throw new PracticeError("Practice LMS: the upload failed (pretend network error). Nothing was handed in.");
  }
  if (answer === "webonly") {
    await log("refused", null).catch(() => {});
    return "webonly";
  }
  const path = `g_${group}/practice/${crypto.randomUUID()}/${clean}`;
  const { error } = await sb.storage.from("chat-files").upload(path, blob, { contentType: blob.type || undefined, upsert: false });
  if (error) {
    if (/mime type/i.test(error.message)) throw new PracticeError("Practice LMS takes documents only (PDF, Word, PowerPoint, Excel, text).");
    throw problem(error, "Could not upload it");
  }
  const status = answer === "draft" ? "draft" : "submitted";
  await log(status, path);
  return status;
}
