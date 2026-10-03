import { db } from "./db";
import { addDays, fromDateStr, toDateStr, weekdayOf } from "./dates";
import { SEED_CATEGORIES } from "./money";
import type {
  CalEvent,
  Category,
  ClassKind,
  EventKind,
  Expense,
  ExpenseCategory,
  MerchantRule,
  Priority,
  Profile,
  Session,
  SessionStatus,
  Slot,
  Subject,
  Subtask,
  Task,
  TaskKind,
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
  patch: Partial<
    Pick<
      Profile,
      | "name"
      | "target"
      | "theme"
      | "onboarded"
      | "budget"
      | "avatar"
      | "textScale"
      | "grid"
      | "branch"
      | "year"
      | "section"
      | "bio"
      | "roll"
    >
  >,
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

const THEME_COLOR = { light: "#f6f5f1", dark: "#0e0f11" } as const;

export const TEXT_SCALES = [0.9, 1, 1.1, 1.25] as const;
export const TEXT_SCALE_LABELS = ["Small", "Default", "Large", "Larger"] as const;

/** Scales the whole interface, the way the phone's own text-size setting does. */
export function applyTextScale(scale: number | undefined): void {
  if (typeof document === "undefined") return;
  const s = TEXT_SCALES.includes(scale as (typeof TEXT_SCALES)[number]) ? (scale as number) : 1;
  document.documentElement.style.zoom = s === 1 ? "" : String(s);
  try {
    localStorage.setItem("dockin-text-scale", String(s));
  } catch {
    /* private mode: ignore */
  }
}

export function applyTheme(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  // Browser/status-bar colour follows the app's choice, not just the phone's.
  const colour = dark ? THEME_COLOR.dark : THEME_COLOR.light;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => (m.content = colour));
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
  from?: string | null;
  until?: string | null;
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
    from: input.from ?? null,
    until: input.until ?? null,
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
/** Whether a slot is part of the timetable on a given date. */
export function appliesOn(slot: Pick<Slot, "from" | "until">, date: string): boolean {
  if (slot.from && date < slot.from) return false;
  if (slot.until && date > slot.until) return false;
  return true;
}

export async function ensureSessionsForDate(date: string): Promise<void> {
  const weekday = weekdayOf(date);
  const slots = await db.slots
    .where("weekday")
    .equals(weekday)
    .filter((s) => !s.deletedAt && appliesOn(s, date))
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
  if (missing.length) {
    try {
      await db.sessions.bulkAdd(missing);
    } catch (e) {
      // Two screens can generate the same day at once. The id is deterministic,
      // so "already exists" just means someone else got there first.
      const errs = (e as { failures?: { name?: string }[] }).failures;
      if (!errs || errs.some((f) => f.name !== "ConstraintError")) throw e;
    }
  }
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

/**
 * Changing a class that already has attendance against it.
 *
 * Editing the slot in place would quietly re-explain what was recorded: mark
 * yourself present for a 9:25 lecture, move it to 1:45, and the old record now
 * claims you attended a class that never ran at that hour. So once a slot has
 * been marked even once, a change ends it yesterday and starts a new one today.
 * Before that it is just a typo being fixed, and it edits in place.
 */
export async function reviseSlot(
  id: string,
  patch: Partial<Pick<Slot, "weekday" | "start" | "end" | "kind" | "room" | "weight" | "subjectId">>,
): Promise<void> {
  const slot = await db.slots.get(id);
  if (!slot || slot.deletedAt) return;
  const t = now();
  const today = toDateStr();

  const marked = await db.sessions
    .filter((s) => s.slotId === id && (s.status === "present" || s.status === "absent") && s.date < today)
    .count();

  if (marked === 0) {
    await db.transaction("rw", db.slots, db.sessions, async () => {
      await db.slots.update(id, { ...patch, updatedAt: t });
      await db.sessions.filter((s) => s.slotId === id && s.status === "unmarked").delete();
    });
    return;
  }

  await db.transaction("rw", db.slots, db.sessions, async () => {
    await db.slots.update(id, { until: addDays(today, -1), updatedAt: t });
    await db.sessions.filter((s) => s.slotId === id && s.date >= today).delete();
    const next: Slot = {
      ...slot,
      ...patch,
      id: uid(),
      from: today,
      until: null,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    };
    await db.slots.add(next);
  });
}

/** Removing a class, keeping whatever it already explains. */
export async function retireSlot(id: string): Promise<void> {
  const slot = await db.slots.get(id);
  if (!slot || slot.deletedAt) return;
  const t = now();
  const today = toDateStr();
  const marked = await db.sessions
    .filter((s) => s.slotId === id && (s.status === "present" || s.status === "absent"))
    .count();

  await db.transaction("rw", db.slots, db.sessions, async () => {
    await db.sessions.filter((s) => s.slotId === id && s.date >= today && s.status === "unmarked").delete();
    if (marked === 0) await db.slots.update(id, { deletedAt: t, updatedAt: t });
    else await db.slots.update(id, { until: addDays(today, -1), updatedAt: t });
  });
}

export interface WeekPlan {
  subjects: { id?: string; name: string; code?: string; color?: string }[];
  /** Indexes into `subjects`, so a plan can be handed around without ids. */
  classes: {
    subject: number;
    weekday: number;
    start: string;
    end: string;
    kind: ClassKind;
    room?: string;
  }[];
}

/**
 * Writes a whole week in one go.
 *
 * `from` is what keeps history honest: rather than editing the old classes,
 * which would silently re-explain attendance already recorded against them, the
 * old slots are stopped the day before and the new ones start on the day. Pass
 * no date and it is treated as a first-time setup, replacing outright.
 */
export async function applyWeekPlan(plan: WeekPlan, from?: string | null): Promise<void> {
  const t = now();
  await db.transaction("rw", db.subjects, db.slots, db.sessions, async () => {
    const live = await db.subjects.filter((s) => !s.deletedAt).toArray();
    const byName = new Map(live.map((s) => [s.name.trim().toLowerCase(), s]));

    const ids: string[] = [];
    for (const want of plan.subjects) {
      const existing = want.id ? live.find((s) => s.id === want.id) : byName.get(want.name.trim().toLowerCase());
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const made = await addSubject({ name: want.name, code: want.code, color: want.color });
      ids.push(made.id);
    }

    const old = await db.slots.filter((s) => !s.deletedAt).toArray();
    if (from) {
      // Keep the old week, but only up to the day before the new one starts.
      const lastDay = addDays(from, -1);
      for (const slot of old) {
        if (slot.from && slot.from > lastDay) await db.slots.update(slot.id, { deletedAt: t, updatedAt: t });
        else await db.slots.update(slot.id, { until: lastDay, updatedAt: t });
      }
      // Anything already generated on or after the change is out of date.
      await db.sessions
        .filter((s) => s.date >= from && s.status === "unmarked")
        .delete();
    } else {
      for (const slot of old) await db.slots.update(slot.id, { deletedAt: t, updatedAt: t });
      await db.sessions.filter((s) => s.status === "unmarked").delete();
    }

    for (const c of plan.classes) {
      const subjectId = ids[c.subject];
      if (!subjectId) continue;
      await addSlot({
        subjectId,
        weekday: c.weekday,
        start: c.start,
        end: c.end,
        kind: c.kind,
        room: c.room,
        from: from ?? null,
      });
    }
  });
}

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

// ---------- categories ----------

/** Puts the starting set in the first time, and never again. */
export async function ensureCategories(): Promise<void> {
  if ((await db.categories.count()) > 0) return;
  const t = now();
  await db.categories.bulkPut(
    SEED_CATEGORIES.map((c, i) => ({
      ...c,
      order: i,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    })),
  );
}

export async function addCategory(input: { label: string; emoji?: string }): Promise<Category> {
  const t = now();
  const last = await db.categories.orderBy("order").last();
  const cat: Category = {
    id: uid(),
    label: input.label.trim().slice(0, 30),
    emoji: input.emoji?.trim().slice(0, 4) || "💸",
    order: (last?.order ?? 0) + 1,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  await db.categories.add(cat);
  return cat;
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, "label" | "emoji" | "order">>,
): Promise<void> {
  await db.categories.update(id, { ...patch, updatedAt: now() });
}

/** Expenses already filed under it keep their label, they just lose the chip. */
export async function deleteCategory(id: string): Promise<void> {
  const t = now();
  await db.categories.update(id, { deletedAt: t, updatedAt: t });
}

// ---------- expenses ----------

// ---------- payees the app has learned ----------

/**
 * What a payee's name means. Asked once, the first time a payment from that
 * shop turns up, and never again — which is the difference between a tray you
 * clear in four taps and one you stop opening.
 */
export async function rememberMerchant(
  key: string,
  label: string,
  category: ExpenseCategory,
): Promise<void> {
  if (!key) return;
  const t = now();
  const existing = await db.merchants.get(key);
  await db.merchants.put({
    id: key,
    label,
    category,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
    deletedAt: null,
  });
}

export async function forgetMerchant(key: string): Promise<void> {
  const existing = await db.merchants.get(key);
  if (existing) await db.merchants.put({ ...existing, deletedAt: now(), updatedAt: now() });
}

export async function merchantRules(): Promise<MerchantRule[]> {
  return (await db.merchants.toArray()).filter((m) => !m.deletedAt);
}

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

/** Result of reading a backup file. */
export interface ImportSummary {
  subjects: number;
  slots: number;
  sessions: number;
  expenses: number;
  tasks: number;
  events: number;
}

const asRows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter(
        (r): r is Record<string, unknown> =>
          !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string",
      )
    : [];

/**
 * Replaces everything on this phone with the contents of a DockIn backup file.
 * Rows are stamped as just-edited so they also upload on the next sync.
 * Throws an Error with a readable message when the file is not a DockIn backup.
 */
export async function importAll(text: string): Promise<ImportSummary> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file is not a valid backup.");
  }
  if (!data || typeof data !== "object" || data.app !== "dockin") {
    throw new Error("That file is not a DockIn backup.");
  }
  const t = now();
  const stamp = (rows: Record<string, unknown>[]) => rows.map((r) => ({ ...r, updatedAt: t }));
  const subjects = stamp(asRows(data.subjects));
  const slots = stamp(asRows(data.slots));
  const sessions = stamp(asRows(data.sessions));
  const expenses = stamp(asRows(data.expenses));
  const tasks = stamp(asRows(data.tasks));
  const events = stamp(asRows(data.events));
  const oldProfile = Array.isArray(data.profile) ? (data.profile[0] as Partial<Profile> | undefined) : undefined;
  const profile: Profile = {
    id: "me",
    name: typeof oldProfile?.name === "string" ? oldProfile.name : "",
    target: typeof oldProfile?.target === "number" ? oldProfile.target : 75,
    theme: oldProfile?.theme === "light" || oldProfile?.theme === "dark" ? oldProfile.theme : "system",
    onboarded: true,
    budget: typeof oldProfile?.budget === "number" ? oldProfile.budget : undefined,
    createdAt: typeof oldProfile?.createdAt === "number" ? oldProfile.createdAt : t,
    updatedAt: t,
  };
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
      await db.profile.put(profile);
      await db.subjects.bulkPut(subjects as never[]);
      await db.slots.bulkPut(slots as never[]);
      await db.sessions.bulkPut(sessions as never[]);
      await db.expenses.bulkPut(expenses as never[]);
      await db.tasks.bulkPut(tasks as never[]);
      await db.events.bulkPut(events as never[]);
    },
  );
  return {
    subjects: subjects.length,
    slots: slots.length,
    sessions: sessions.length,
    expenses: expenses.length,
    tasks: tasks.length,
    events: events.length,
  };
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
