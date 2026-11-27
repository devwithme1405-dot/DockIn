/**
 * Camu and the LMS, as the rest of the app sees them.
 *
 * The phone does the fetching (android/…/College.java) — hourly in the
 * background and whenever the app opens — and keeps the last good copy. This
 * file turns that copy into the shapes the screens already draw: subjects,
 * classes with present/absent, an overall summary, and LMS deadlines as tasks.
 *
 * Camu is the truth for attendance once it is connected. Nothing here is ever
 * marked by hand, so a number on screen is always the number the college has.
 */

import { isPracticeTask } from "./practiceLms";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { db } from "./db";
import { addDays, toDateStr, weekdayOf } from "./dates";
import { summarize } from "./attendance";
import { DockIn, isNativeApp, onPhone, type CamuClass, type CamuPeriod, type CamuState, type CamuSubject, type CollegeState, type LmsItem } from "./native";
import { useAttendanceStats } from "./hooks";
import { getSupabase } from "./supabase";
import { afterFirstSync } from "./sync";
import type { AttendanceSummary, Session, Subject, Task } from "./types";

// ---------------------------------------------------------------------------
// Names

/** "Database Management Systems ( P-LA-203 )" → "Database Management Systems". */
export function cleanName(name: string): string {
  return name
    .replace(/\s*\(\s*[^)]*\)?\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** "2025CSET200" → "CSET200": the year Camu prefixes says nothing to a student. */
export function cleanCode(code: string): string {
  return code.replace(/^(?:19|20)\d{2}(?=[A-Z])/, "").trim();
}

const COLORS = ["#3B6FD4", "#7A5BC7", "#C2517E", "#1F8A94", "#5F6B7A", "#8C6A4F", "#7F8A2E", "#4F5BD5"];

/** The same subject keeps the same colour on every screen and every phone. */
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

// ---------------------------------------------------------------------------
// Attendance maths on Camu's numbers

export function camuSummary(present: number, total: number, target: number): AttendanceSummary {
  return summarize(
    [
      { status: "present", weight: Math.max(0, present) },
      { status: "absent", weight: Math.max(0, total - present) },
    ],
    target,
  );
}

/** Which Camu subject a timetable period belongs to: by id, then by code, then by name. */
export function subjectOf(p: Pick<CamuPeriod, "subId" | "code" | "name">, subjects: CamuSubject[]): CamuSubject | undefined {
  const byId = subjects.find((s) => s.id === p.subId);
  if (byId) return byId;
  if (p.code) {
    const code = p.code.toUpperCase();
    const byCode = subjects.find((s) => s.code.toUpperCase().endsWith(code) || cleanCode(s.code).toUpperCase() === code);
    if (byCode) return byCode;
  }
  const name = cleanName(p.name).toLowerCase();
  return subjects.find((s) => cleanName(s.name).toLowerCase() === name);
}

// ---------------------------------------------------------------------------
// The day

export function holidayOn(state: CamuState | undefined, date: string) {
  return (state?.holidays ?? []).find((h) => h.start <= date && date < (h.end > h.start ? h.end : addDays(h.start, 1)));
}

/** Last day of a holiday, from Camu's exclusive end. */
export function holidayLastDay(h: { start: string; end: string }): string {
  return h.end > h.start ? addDays(h.end, -1) : h.start;
}

export interface DayClass extends CamuPeriod {
  /** Camu has not posted this day yet; it is the same weekday from the last week it did. */
  usual: boolean;
}

/**
 * The classes on a date, in order — only what MyCamu has actually published.
 * A day Camu hasn't posted yet stays empty (never guessed from last week), so
 * the timetable, Today and the reminders only ever show real classes.
 */
export function classesOn(state: CamuState | undefined, date: string): DayClass[] {
  const exact = (state?.periods ?? []).filter((p) => p.date === date);
  if (!exact.length || holidayOn(state, date)) return [];
  return dedupeSort(exact).map((p) => ({ ...p, usual: false }));
}

/**
 * Classes on a date for the trip calculator, projected all the way to the last
 * teaching day.
 *
 * `classesOn` shows only what Camu has published, which is right for the live
 * timetable but wrong here: Camu often doesn't post even next
 * week, yet the week itself barely changes. So for any working day Camu hasn't
 * published — up to `semEnd` — this stands in the same weekday from the most
 * recent published week and marks it `usual` (a guess). Past `semEnd`, exams have
 * begun and nothing is counted.
 */
export function projectedClassesOn(state: CamuState | undefined, date: string, semEnd: string): DayClass[] {
  if (semEnd && date > semEnd) return [];
  const periods = state?.periods ?? [];
  const exact = periods.filter((p) => p.date === date);
  if (exact.length) return dedupeSort(exact).map((p) => ({ ...p, usual: false }));
  if (holidayOn(state, date)) return [];
  const last = periods.reduce((m, p) => (p.date > m ? p.date : m), "");
  // A blank day inside the published range is a genuine day off, not a gap to fill.
  if (!last || date <= last) return [];
  const wd = weekdayOf(date);
  const sameDay = periods
    .filter((p) => weekdayOf(p.date) === wd)
    .reduce((m, p) => (p.date > m ? p.date : m), "");
  if (!sameDay) return [];
  return dedupeSort(periods.filter((p) => p.date === sameDay)).map((p) => ({ ...p, date, usual: true }));
}

/** The latest date Camu has actually published a timetable for (empty string if none). */
export function lastPublishedDate(state: CamuState | undefined): string {
  return (state?.periods ?? []).reduce((m, p) => (p.date > m ? p.date : m), "");
}

function dedupeSort(list: CamuPeriod[]): CamuPeriod[] {
  const seen = new Set<string>();
  const out: CamuPeriod[] = [];
  for (const p of [...list].sort((a, b) => a.from.localeCompare(b.from))) {
    const key = `${p.from}|${p.subId || p.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** The next class after now, looking up to a week ahead. */
export function nextClass(state: CamuState | undefined, today: string, hm: string): DayClass | null {
  for (let i = 0; i <= 7; i++) {
    const d = addDays(today, i);
    const list = classesOn(state, d).filter((p) => i > 0 || p.from > hm);
    if (list.length) return list[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Camu in the shape the attendance screens already draw

export interface ViewSession extends Session {
  room?: string;
  teacher?: string;
  /** From Camu: read-only, nothing to mark. */
  camu?: boolean;
  usual?: boolean;
}

export interface CamuView {
  subjects: Subject[];
  sessions: ViewSession[];
  stats: { subject: Subject; summary: AttendanceSummary; counts: { present: number; absent: number; cancelled: number }; camu: CamuSubject }[];
  overall: AttendanceSummary;
  overallCounts: { present: number; absent: number; cancelled: number };
}

const subjectId = (id: string) => `camu:${id}`;

function mins(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Which of a day's periods are labs, keyed by start time.
 *
 * Camu does not reliably say "practical", so we read it off the timetable the
 * way a student does: a lab is the double period. If one block already runs the
 * full two hours, or two periods of the same subject sit back to back, both are
 * the lab. Camu's own "prac"/"lab" tag still counts when it is there.
 */
export function labStarts(periods: DayClass[]): Set<string> {
  const labs = new Set<string>();
  const sorted = [...periods].sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    if (/prac|lab/i.test(p.kind)) labs.add(p.from);
    if (p.to && mins(p.to) - mins(p.from) >= 110) labs.add(p.from);
    const q = sorted[i + 1];
    if (q && q.subId === p.subId && p.to && p.to === q.from) {
      labs.add(p.from);
      labs.add(q.from);
    }
  }
  return labs;
}

/**
 * Subjects, every class Camu has recorded, and the timetable around today,
 * as one set of sessions. A class in the history is present or absent; one
 * on the timetable that Camu has not marked yet is "unmarked".
 */
export function camuView(state: CamuState | undefined, target: number, today: string): CamuView | null {
  if (!state?.subjects?.length) return null;
  const t0 = state.syncedAt ?? 0;
  const subjects: Subject[] = state.subjects.map((s) => ({
    id: subjectId(s.id),
    name: cleanName(s.name),
    code: cleanCode(s.code),
    color: colorFor(s.id),
    createdAt: t0,
    updatedAt: t0,
  }));

  const sessions: ViewSession[] = [];
  const have = new Set<string>();
  const history: Record<string, CamuClass[]> = state.history ?? {};
  for (const s of state.subjects) {
    for (const c of history[s.id] ?? []) {
      const id = `camu:${s.id}:${c.date}:${c.from}`;
      if (have.has(id)) continue;
      have.add(id);
      sessions.push(session(id, subjectId(s.id), c.date, c.from, c.to, c.present ? "present" : "absent"));
    }
  }
  // Every timetable day Camu has shown (kept across syncs), and a week ahead.
  const byId = new Map(sessions.map((x) => [x.id, x]));
  const earliest = (state.periods ?? []).reduce((m, p) => (p.date && p.date < m ? p.date : m), addDays(today, -7));
  const from = earliest < addDays(today, -200) ? addDays(today, -200) : earliest;
  for (let date = from; date <= addDays(today, 7); date = addDays(date, 1)) {
    const dayPeriods = classesOn(state, date);
    const labs = labStarts(dayPeriods);
    for (const p of dayPeriods) {
      const sub = subjectOf(p, state.subjects);
      if (!sub) continue;
      const id = `camu:${sub.id}:${date}:${p.from}`;
      const kind = labs.has(p.from) ? "practical" : "lecture";
      const known = byId.get(id);
      if (known) {
        known.room = p.room;
        known.teacher = p.teacher;
        if (p.to) known.end = p.to;
        known.kind = kind;
        continue;
      }
      have.add(id);
      const s = session(id, subjectId(sub.id), date, p.from, p.to || p.from, "unmarked");
      s.room = p.room;
      s.teacher = p.teacher;
      s.kind = kind;
      s.usual = p.usual;
      sessions.push(s);
      byId.set(id, s);
    }
  }
  sessions.sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));

  const stats = state.subjects.map((c, i) => {
    const summary = camuSummary(c.present, c.total, target);
    return {
      subject: subjects[i],
      summary,
      counts: { present: c.present, absent: Math.max(0, c.total - c.present), cancelled: 0 },
      camu: c,
    };
  });
  const o = state.overall ?? {
    present: state.subjects.reduce((n, s) => n + s.present, 0),
    total: state.subjects.reduce((n, s) => n + s.total, 0),
    pct: 0,
  };
  const overall = camuSummary(o.present, o.total, target);
  return {
    subjects,
    sessions,
    stats,
    overall,
    overallCounts: { present: o.present, absent: Math.max(0, o.total - o.present), cancelled: 0 },
  };

  function session(id: string, subject: string, date: string, start: string, end: string, status: Session["status"]): ViewSession {
    return {
      id,
      slotId: "camu",
      subjectId: subject,
      date,
      start,
      end,
      kind: "lecture",
      weight: 1,
      status,
      createdAt: t0,
      updatedAt: t0,
      camu: true,
    };
  }
}

// ---------------------------------------------------------------------------
// The live copy, shared by every screen

const EMPTY: CollegeState = {};
let current: CollegeState = EMPTY;
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
/** A sync is worth starting when the last one is older than this. */
const STALE_MS = 15 * 60 * 1000;
let syncing: Promise<void> | null = null;
/**
 * Backing off when Camu or the LMS will not answer. A failed sync leaves the
 * data untouched, so without this the "data is stale" check below would fire a
 * fresh request on every single app open — exactly the hammering that gets an
 * account rate-limited. Instead each failure in a row pushes the next attempt
 * further out: 30s, 1m, 2m … up to the normal 15-minute cadence. One clean sync
 * resets it. Camu signing you out is handled by a renewal, not counted here.
 */
let lastSyncAttempt = 0;
let syncFails = 0;

function syncHadError(s: CollegeState): boolean {
  const camu = !!(s.camu?.connected && s.camu.error && !s.camu.expired);
  const lms = !!(s.lms?.connected && s.lms.error);
  return camu || lms;
}

function syncBackoffMs(): number {
  return syncFails > 0 ? Math.min(STALE_MS, 30_000 * 2 ** (syncFails - 1)) : 0;
}
/** At most one silent Camu renewal per app open, so a stubborn expiry never loops. */
let renewing = false;
let renewTried = false;

const ARCHIVE = "dockin-camu-periods";

/**
 * Every day of timetable Camu has ever shown this phone, kept for the whole
 * semester. Camu only answers a window around today (and often nothing for
 * days already past), and each sync used to replace the stored copy — so
 * yesterday's classes vanished from the timetable. Now each sync's days
 * replace only those same days; every other day stays as Camu last showed it.
 */
export function mergePeriods(archive: Record<string, CamuPeriod[]>, fresh: CamuPeriod[], today: string): Record<string, CamuPeriod[]> {
  const out: Record<string, CamuPeriod[]> = { ...archive };
  const byDay = new Map<string, CamuPeriod[]>();
  for (const p of fresh) {
    if (!p?.date) continue;
    const list = byDay.get(p.date) ?? [];
    list.push(p);
    byDay.set(p.date, list);
  }
  for (const [day, list] of byDay) out[day] = list;
  // A semester and a bit is plenty; older days are dropped.
  const floor = addDays(today, -200);
  for (const day of Object.keys(out)) if (day < floor) delete out[day];
  return out;
}

function withArchive(next: CollegeState): CollegeState {
  const fresh = next?.camu?.periods;
  if (!next?.camu || !Array.isArray(fresh) || typeof window === "undefined") return next;
  let archive: Record<string, CamuPeriod[]> = {};
  try {
    archive = JSON.parse(localStorage.getItem(ARCHIVE) ?? "{}") ?? {};
  } catch {
    archive = {};
  }
  const merged = mergePeriods(archive, fresh, toDateStr());
  try {
    localStorage.setItem(ARCHIVE, JSON.stringify(merged));
  } catch {
    // Storage full or private: still show what we have this time.
  }
  const periods = Object.keys(merged)
    .sort()
    .flatMap((d) => merged[d]);
  return { ...next, camu: { ...next.camu, periods } };
}

function set(next: CollegeState) {
  current = withArchive(next ?? EMPTY);
  loaded = true;
  listeners.forEach((l) => l());
  void importLms(current);
  maybeRenewCamu();
}

/**
 * Camu ends the session every so often. When the phone reports it expired, try
 * to get it back without bothering him: the renewal rides the sign-in Microsoft
 * already remembers and stays behind a "Reconnecting…" screen, only showing the
 * page if a tap is truly needed. Done once per app open; the phone's own
 * notification covers the case where even that needs him.
 */
function maybeRenewCamu() {
  if (!isNativeApp() || renewing) return;
  // A healthy session clears the latch, so a fresh expiry later can renew again.
  if (current.camu?.connected && !current.camu?.expired) renewTried = false;
  if (renewTried) return;
  if (!(current.camu?.connected && current.camu?.expired)) return;
  renewing = true;
  renewTried = true;
  void DockIn.renewCamu()
    .then(set)
    .catch(() => {})
    .finally(() => {
      renewing = false;
    });
}

export const collegeNow = () => current;

/** Fetch now unless a fetch is already running. `full` also re-reads every class. */
export function syncCollege(full = false): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  if (syncing) return syncing;
  lastSyncAttempt = Date.now();
  syncing = DockIn.syncCollege({ full })
    .then((s) => {
      set(s);
      syncFails = syncHadError(s) ? syncFails + 1 : 0;
    })
    .catch(() => {
      syncFails += 1;
    })
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

function start() {
  if (started || typeof window === "undefined" || !isNativeApp()) return;
  started = true;
  const refresh = async () => {
    try {
      const s = await DockIn.college();
      set(s);
      const connected = s.camu?.connected || s.lms?.connected;
      const stale = Date.now() - (s.syncedAt ?? 0) > STALE_MS;
      const cooled = Date.now() - lastSyncAttempt >= syncBackoffMs();
      if (connected && stale && cooled) void syncCollege();
    } catch {
      loaded = true;
      listeners.forEach((l) => l());
    }
  };
  void refresh();
  onPhone("college", (s) => set(s));
  onPhone("resume", () => void refresh());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Camu and LMS as last fetched, live. `ready` is false until the phone has answered once. */
export function useCollege(): { state: CollegeState; ready: boolean; native: boolean } {
  const state = useSyncExternalStore(subscribe, () => current, () => EMPTY);
  const ready = useSyncExternalStore(subscribe, () => loaded, () => false);
  useEffect(start, []);
  const native = typeof window !== "undefined" && isNativeApp();
  return { state, ready: ready || !native, native };
}

export type AttendanceData = NonNullable<ReturnType<typeof useAttendanceStats>> & {
  sessions: ViewSession[];
};

/**
 * The attendance every screen draws: Camu's once it is connected, the
 * hand-marked record otherwise. `camu` is Camu's state when it is the source,
 * so a screen can show where the numbers come from and hide the marking.
 */
export function useAttendanceData(target: number): {
  data: AttendanceData | undefined;
  camu: CamuState | null;
  native: boolean;
} {
  const local = useAttendanceStats(target);
  const { state, ready, native } = useCollege();
  const today = toDateStr();
  const view = useMemo(
    () => (state.camu?.connected ? camuView(state.camu, target, today) : null),
    [state.camu, target, today],
  );
  // In the app, wait for the phone's answer rather than flash the old record.
  if (native && !ready) return { data: undefined, camu: null, native };
  if (view && state.camu) {
    return {
      data: { ...view, stats: view.stats.map(({ subject, summary, counts }) => ({ subject, summary, counts })) },
      camu: state.camu,
      native,
    };
  }
  return { data: local, camu: null, native };
}

let loginIdTried = false;
/**
 * Sessions that signed in before DockIn read the login id saved their ids
 * without it, so making a pass would ask to "teach" MyCamu. Re-read the ids once,
 * quietly (the renew rides the session already saved — no sign-in, no prompt),
 * so day outs just work. Best-effort; if anything is off it simply does nothing.
 */
export async function ensureCamuLoginId(): Promise<void> {
  if (!isNativeApp() || loginIdTried) return;
  loginIdTried = true;
  try {
    const r = await DockIn.camuCanMakePass();
    if (r.ok || r.connected === false) return;
    await DockIn.renewCamu();
  } catch {
    /* best-effort */
  }
}

export async function connectCamu(): Promise<void> {
  set(await DockIn.connectCamu());
}

export async function connectLms(username: string, password: string): Promise<void> {
  set(await DockIn.connectLms({ username, password }));
}

export async function disconnect(which: "camu" | "lms"): Promise<void> {
  if (which === "camu") {
    try {
      localStorage.removeItem(ARCHIVE);
    } catch {
      // nothing kept
    }
  }
  set(await DockIn.disconnectCollege({ which }));
}

// ---------------------------------------------------------------------------
// LMS deadlines as tasks

export const lmsTaskId = (i: Pick<LmsItem, "module" | "instance">) => `lms-${i.module}-${i.instance}`;

/** One LMS item as the task it becomes. Done-ness is left to whoever calls this. */
export function lmsTask(i: LmsItem): Pick<Task, "title" | "notes" | "kind" | "dueDate" | "dueTime"> & { url: string; source: "lms" } {
  const due = new Date(i.due * 1000);
  const hh = String(due.getHours()).padStart(2, "0");
  const mm = String(due.getMinutes()).padStart(2, "0");
  return {
    title: i.name.trim() || "LMS item",
    notes: cleanName(i.course),
    kind: i.module === "quiz" ? "quiz" : "assignment",
    dueDate: i.due ? toDateStr(due) : null,
    dueTime: i.due ? `${hh}:${mm}` : null,
    url: i.url,
    source: "lms",
  };
}

let lastImported = "";

/**
 * Keeps Tasks in step with the LMS: a new item appears as a task, a changed
 * deadline moves, and one that drops off the LMS's to-do list (submitted) is
 * ticked off. A task ticked by hand stays ticked.
 */
async function signedIn(): Promise<boolean> {
  try {
    return !!(await getSupabase()?.auth.getSession())?.data.session;
  } catch {
    return false;
  }
}

export async function importLms(state: CollegeState, nowMs = Date.now()): Promise<void> {
  const lms = state.lms;
  if (!lms?.connected || !lms.items || !lms.syncedAt) return;
  const stamp = `${lms.syncedAt}:${lms.items.length}`;
  if (stamp === lastImported) return;
  lastImported = stamp;

  // Signed in: let the cloud copy land first, so an assignment deleted or
  // ticked off before a logout is known and is not made again.
  if (await signedIn()) await afterFirstSync();

  const t = nowMs;
  const live = new Set(lms.items.map(lmsTaskId));
  for (const item of lms.items) {
    const id = lmsTaskId(item);
    const want = lmsTask(item);
    const have = await db.tasks.get(id);
    if (!have) {
      // updatedAt 0: an untouched LMS task is the LMS's, not a change of mine.
      // Any copy in the cloud (deleted, done, edited) is newer and wins; it
      // only syncs up once I actually do something with it.
      await db.tasks.put({
        id,
        ...want,
        subjectId: null,
        room: "",
        priority: "med",
        done: false,
        doneAt: null,
        subtasks: [],
        createdAt: t,
        updatedAt: 0,
        deletedAt: null,
      });
      continue;
    }
    if (have.deletedAt) continue;
    const changed =
      have.title !== want.title || have.dueDate !== want.dueDate || have.dueTime !== want.dueTime || have.notes !== want.notes;
    if (changed) await db.tasks.update(id, { ...want, updatedAt: have.updatedAt ? t : 0 });
  }

  // Gone from the to-do list while its deadline is still inside the window the
  // phone asks about: Moodle removes an item once it is submitted.
  const window = nowMs - 13 * 24 * 3600 * 1000;
  // The practice LMS's assignments are never on the real to-do list: leave them be.
  const mine = await db.tasks.filter((x) => x.id.startsWith("lms-") && !isPracticeTask(x.id) && !x.deletedAt && !x.done).toArray();
  for (const task of mine) {
    if (live.has(task.id)) continue;
    const due = task.dueDate ? new Date(`${task.dueDate}T${task.dueTime ?? "23:59"}`).getTime() : 0;
    if (due && due < window) continue;
    await db.tasks.update(task.id, { done: true, doneAt: t, updatedAt: task.updatedAt ? t : 0 });
  }
}

/** For tests: forget what was imported last. */
export function resetImportMemo() {
  lastImported = "";
}
