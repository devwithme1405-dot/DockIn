import { db } from "./db";
import { addDays, fromDateStr, weekdayOf } from "./dates";
import type {
  CalEvent,
  ClassKind,
  EventKind,
  Expense,
  ExpenseCategory,
  Profile,
  Session,
  SessionStatus,
  Slot,
  Subject,
  Subtask,
  Task,
  TaskKind,
  Priority,
  ThemePref,
} from "./types";

/** RFC4122 v4 id. randomUUID only exists in secure contexts, so fall back. */
export function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const now = () => Date.now();

export const SUBJECT_COLORS = [
  "#3B6FD4",
  "#7A5BC7",
  "#C2517E",
  "#1F8A94",
  "#5F6B7A",
  "#8C6A4F",
  "#7F8A2E",
  "#4F5BD5",
];

// ---------- profile ----------

export async function getProfile(): Promise<Profile | null> {
  return (await db.profile.get("me")) ?? null;
}

export async function saveProfile(
  patch: Partial<Pick<Profile, "name" | "target" | "theme" | "onboarded" | "budget">>,
): Promise<void> {
  const existing = await db.profile.get("me");
  const t = now();
  const next: Profile = {
    id: "me",
    name: "",
    target: 75,
    theme: "system",
    onboarded: false,
    createdAt: existing?.createdAt ?? t,
    ...existing,
    ...patch,
    updatedAt: t,
  };
  await db.profile.put(next);
}

export function applyTheme(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    localStorage.setItem("dockin-theme", pref);
  } catch {
    /* private mode: ignore */
  }
}

// ---------- subjects ----------

export async function addSubject(input: {
  name: string;
  code?: string;
  color?: string;
}): Promise<Subject> {
  const t = now();
  const count = await db.subjects.filter((s) => !s.deletedAt).count();
  const subject: Subject = {
    id: uid(),
    name: input.name.trim(),
    code: (input.code ?? "").trim(),
    color: input.color ?? SUBJECT_COLORS[count % SUBJECT_COLORS.length],
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  await db.subjects.add(subject);
  return subject;
}

export async function setSubjectBase(
  id: string,
  attended: number,
  total: number,
): Promise<void> {
  const t = Math.max(0, Math.floor(total));
  const a = Math.min(Math.max(0, Math.floor(attended)), t);
  await db.subjects.update(id, {
    baseAttended: a,
    baseTotal: t,
    updatedAt: now(),
  });
}

export async function deleteSubject(id: string): Promise<void> {
  const t = now();
  await db.transaction("rw", db.subjects, db.slots, async () => {
    await db.subjects.update(id, { deletedAt: t, updatedAt: t });
    await db.slots
      .where("subjectId")
      .equals(id)
      .modify({ deletedAt: t, updatedAt: t });
  });
}

// ---------- slots (weekly timetable) ----------

export async function addSlot(input: {
  subjectId: string;
  weekday: number;
  start: string;
  end: string;
  kind: ClassKind;
  weight?: number;
  room?: string;
}): Promise<Slot> {
  const t = now();
  const slot: Slot = {
    id: uid(),
    subjectId: input.subjectId,
    weekday: input.weekday,
    start: input.start,
    end: input.end,
    kind: input.kind,
    room: input.room,
    weight: input.weight ?? 1,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  await db.slots.add(slot);
  return slot;
}

export async function deleteSlot(id: string): Promise<void> {
  const t = now();
  await db.slots.update(id, { deletedAt: t, updatedAt: t });
}

// ---------- sessions (one real class on one real date) ----------

/**
 * Make sure a Session row exists for every class scheduled on `date`.
 * Safe to call repeatedly: ids are deterministic, existing rows are untouched.
 */
export async function ensureSessionsForDate(date: string): Promise<void> {
  const weekday = weekdayOf(date);
  const slots = await db.slots
    .where("weekday")
    .equals(weekday)
    .filter((s) => !s.deletedAt)
    .toArray();
  if (slots.length === 0) return;

  const ids = slots.map((s) => `${s.id}:${date}`);
  const existing = await db.sessions.bulkGet(ids);
  const t = now();
  const missing: Session[] = [];
  const holiday = existing.some((e) => !e) ? await isHoliday(date) : false;
  slots.forEach((slot, i) => {
    if (existing[i]) return;
    missing.push({
      id: ids[i],
      slotId: slot.id,
      subjectId: slot.subjectId,
      date,
      start: slot.start,
      end: slot.end,
      kind: slot.kind,
      weight: slot.weight,
      status: holiday ? "holiday" : "unmarked",
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    });
  });
  if (missing.length) await db.sessions.bulkAdd(missing);
}

/** Create unmarked sessions for every day from `from` up to and including `to`. */
export async function ensureSessionsSince(
  from: string,
  to: string,
): Promise<void> {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    await ensureSessionsForDate(d);
  }
}

export async function setSessionStatus(
  id: string,
  status: SessionStatus,
): Promise<void> {
  await db.sessions.update(id, { status, updatedAt: now() });
}

/** Create unmarked sessions for the last `days` days up to and including today. */
export async function ensureRecentSessions(
  today: string,
  days: number,
): Promise<void> {
  for (let i = days; i >= 0; i--) {
    await ensureSessionsForDate(addDays(today, -i));
  }
}

// ---------- tasks ----------

export interface TaskInput {
  title: string;
  kind?: TaskKind;
  notes?: string;
  subjectId?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  room?: string;
  priority?: Priority;
  subtasks?: Subtask[];
}

export async function addTask(input: TaskInput): Promise<Task> {
  const t = now();
  const task: Task = {
    id: uid(),
    title: input.title.trim(),
    notes: (input.notes ?? "").trim(),
    kind: input.kind ?? "assignment",
    subjectId: input.subjectId ?? null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    room: (input.room ?? "").trim(),
    priority: input.priority ?? "med",
    done: false,
    doneAt: null,
    subtasks: input.subtasks ?? [],
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  await db.tasks.put(task);
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, "id" | "createdAt">>,
): Promise<void> {
  await db.tasks.update(id, { ...patch, updatedAt: now() });
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  await db.tasks.update(id, { done, doneAt: done ? now() : null, updatedAt: now() });
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.update(id, { deletedAt: now(), updatedAt: now() });
}

export async function restoreTask(id: string): Promise<void> {
  await db.tasks.update(id, { deletedAt: null, updatedAt: now() });
}

// ---------- calendar events and holidays ----------

const MAX_RANGE_DAYS = 120;

function rangeDates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start, n = 0; d <= end && n < MAX_RANGE_DAYS; d = addDays(d, 1), n++) out.push(d);
  return out;
}

export async function isHoliday(date: string): Promise<boolean> {
  const list = await db.events.filter((e) => !e.deletedAt && e.kind === "holiday").toArray();
  return list.some((e) => e.date <= date && date <= e.endDate);
}

/** Classes on holiday dates stop counting towards attendance. */
async function markHolidayRange(start: string, end: string): Promise<void> {
  for (const date of rangeDates(start, end)) {
    await ensureSessionsForDate(date);
    const rows = await db.sessions.where("date").equals(date).toArray();
    const toChange = rows.filter((r) => r.status === "unmarked");
    if (toChange.length)
      await db.sessions.bulkPut(toChange.map((r) => ({ ...r, status: "holiday" as const, updatedAt: now() })));
  }
}

/** Undo the above for days no longer covered by any holiday. */
async function unmarkHolidayRange(start: string, end: string): Promise<void> {
  for (const date of rangeDates(start, end)) {
    if (await isHoliday(date)) continue;
    const rows = await db.sessions.where("date").equals(date).toArray();
    const toChange = rows.filter((r) => r.status === "holiday");
    if (toChange.length)
      await db.sessions.bulkPut(toChange.map((r) => ({ ...r, status: "unmarked" as const, updatedAt: now() })));
  }
}

export interface EventInput {
  title: string;
  kind: EventKind;
  date: string;
  endDate?: string;
  note?: string;
}

export async function addEvent(input: EventInput): Promise<CalEvent> {
  const t = now();
  const end = input.endDate && input.endDate > input.date ? input.endDate : input.date;
  const e: CalEvent = {
    id: uid(),
    title: input.title.trim(),
    kind: input.kind,
    date: input.date,
    endDate: end,
    note: (input.note ?? "").trim(),
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  await db.events.put(e);
  if (e.kind === "holiday") await markHolidayRange(e.date, e.endDate);
  return e;
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  const old = await db.events.get(id);
  if (!old) return;
  const end = input.endDate && input.endDate > input.date ? input.endDate : input.date;
  await db.events.update(id, {
    title: input.title.trim(),
    kind: input.kind,
    date: input.date,
    endDate: end,
    note: (input.note ?? "").trim(),
    updatedAt: now(),
  });
  await unmarkHolidayRange(old.date, old.endDate);
  if (input.kind === "holiday") await markHolidayRange(input.date, end);
}

export async function deleteEvent(id: string): Promise<void> {
  const old = await db.events.get(id);
  if (!old) return;
  await db.events.update(id, { deletedAt: now(), updatedAt: now() });
  if (old.kind === "holiday") await unmarkHolidayRange(old.date, old.endDate);
}

export async function restoreEvent(id: string): Promise<void> {
  const old = await db.events.get(id);
  if (!old) return;
  await db.events.update(id, { deletedAt: null, updatedAt: now() });
  if (old.kind === "holiday") await markHolidayRange(old.date, old.endDate);
}

// ---------- sample data ----------

type SampleSlot = [
  subject: string,
  weekday: number,
  start: string,
  end: string,
  kind: ClassKind,
];

const SAMPLE_SUBJECTS: { name: string; code: string }[] = [
  { name: "Data Structures", code: "DSA" },
  { name: "Probability & Statistics", code: "P&S" },
  { name: "Microprocessors & Computer Architecture", code: "MPCA" },
  { name: "Full Stack Development", code: "FSD" },
  { name: "Database Management Systems", code: "DBMS" },
];

// End times for lectures are assumed to be 60 minutes; edit them in the timetable.
const SAMPLE_SLOTS: SampleSlot[] = [
  ["DSA", 1, "09:25", "10:25", "lecture"],
  ["P&S", 1, "12:40", "14:45", "practical"],
  ["MPCA", 1, "15:55", "18:00", "practical"],
  ["FSD", 2, "08:20", "12:35", "practical"],
  ["FSD", 2, "13:45", "14:45", "lecture"],
  ["MPCA", 2, "14:50", "15:50", "lecture"],
  ["DSA", 3, "08:20", "10:25", "practical"],
  ["DSA", 3, "11:35", "12:35", "lecture"],
  ["FSD", 3, "13:45", "14:45", "lecture"],
  ["P&S", 3, "14:50", "15:50", "lecture"],
  ["DBMS", 4, "08:20", "10:25", "practical"],
  ["MPCA", 4, "10:30", "11:30", "lecture"],
  ["DBMS", 4, "13:45", "14:45", "lecture"],
  ["DSA", 4, "14:50", "15:50", "lecture"],
  ["P&S", 4, "15:55", "16:55", "lecture"],
  ["DBMS", 5, "09:25", "10:25", "lecture"],
  ["FSD", 5, "13:45", "14:45", "lecture"],
];

export async function seedSampleTimetable(): Promise<void> {
  const byCode = new Map<string, string>();
  for (const s of SAMPLE_SUBJECTS) {
    const sub = await addSubject(s);
    byCode.set(s.code, sub.id);
  }
  for (const [code, weekday, start, end, kind] of SAMPLE_SLOTS) {
    await addSlot({
      subjectId: byCode.get(code)!,
      weekday,
      start,
      end,
      kind,
    });
  }
}

// ---------- backup / reset ----------

// ---------- expenses ----------

export async function addExpense(input: {
  amount: number;
  category: ExpenseCategory;
  note?: string;
  date: string;
}): Promise<Expense> {
  const t = now();
  const e: Expense = {
    id: uid(),
    amount: Math.round(input.amount * 100) / 100,
    category: input.category,
    note: (input.note ?? "").trim(),
    date: input.date,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  await db.expenses.put(e);
  return e;
}

export async function updateExpense(
  id: string,
  patch: Partial<Pick<Expense, "amount" | "category" | "note" | "date">>,
): Promise<void> {
  const next = { ...patch, updatedAt: now() };
  if (typeof next.amount === "number") next.amount = Math.round(next.amount * 100) / 100;
  if (typeof next.note === "string") next.note = next.note.trim();
  await db.expenses.update(id, next);
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.update(id, { deletedAt: now(), updatedAt: now() });
}

export async function restoreExpense(id: string): Promise<void> {
  await db.expenses.update(id, { deletedAt: null, updatedAt: now() });
}

export async function exportAll(): Promise<string> {
  const [profile, subjects, slots, sessions, expenses, tasks, events] = await Promise.all([
    db.profile.toArray(),
    db.subjects.toArray(),
    db.slots.toArray(),
    db.sessions.toArray(),
    db.expenses.toArray(),
    db.tasks.toArray(),
    db.events.toArray(),
  ]);
  return JSON.stringify(
    { app: "dockin", version: 3, exportedAt: now(), profile, subjects, slots, sessions, expenses, tasks, events },
    null,
    2,
  );
}

export async function resetAll(): Promise<void> {
  await db.transaction(
    "rw",
    [db.profile, db.subjects, db.slots, db.sessions, db.expenses, db.tasks, db.events],
    async () => {
      await Promise.all([
        db.profile.clear(),
        db.subjects.clear(),
        db.slots.clear(),
        db.sessions.clear(),
        db.expenses.clear(),
        db.tasks.clear(),
        db.events.clear(),
      ]);
    },
  );
}

/** Used by tests and the "bunk planner": parse a stored date safely. */
export function isValidDate(s: string): boolean {
  return !Number.isNaN(fromDateStr(s).getTime());
}
