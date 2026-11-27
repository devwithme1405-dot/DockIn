import { camuSummary, classesOn, cleanName, collegeNow, holidayOn } from "../college";
import { addDays, fmtDayLong, relativeDayLabel, toDateStr, weekdayOf } from "../dates";
import { db } from "../db";
import { DAYOUT_END, needsProof, PASS_START, type PassDraft } from "../outpass";
import { addTask, getProfile } from "../repo";
import { newId, v3db, type Action, type Card, type PassRecord, type Stat } from "./store";

/**
 * What the assistant can look up and do, the same for the demo brain and a
 * real model: each tool answers with plain data (for the model to word) and a
 * card (for the screen). Anything that changes something — a task, an outpass —
 * is only ever proposed here; it happens when the student taps Confirm.
 */

export interface ToolResult {
  /** Plain facts, small, for a model to read. */
  data: unknown;
  card?: Card;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function target(): Promise<number> {
  return (await getProfile())?.target ?? 75;
}

function stat(present: number, total: number, t: number): Stat {
  const s = camuSummary(present, total, t);
  return {
    pct: s.pct,
    present,
    total,
    canMiss: Number.isFinite(s.canMiss) ? s.canMiss : 0,
    mustAttend: Number.isFinite(s.mustAttend) ? s.mustAttend : 0,
    state: s.state,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, " ").trim();

/** Short forms students use, and words that must appear in the subject's name. */
const SHORT: Record<string, string[]> = {
  dbms: ["database"],
  db: ["database"],
  os: ["operating"],
  cn: ["network"],
  daa: ["algorithm"],
  dsa: ["data structure"],
  ds: ["data structure"],
  oop: ["object"],
  oops: ["object"],
  se: ["software"],
  coa: ["organi"],
  toc: ["computation"],
  ai: ["artificial"],
  ml: ["machine learning"],
  dm: ["discrete"],
  maths: ["math"],
  math: ["math"],
  evs: ["environment"],
  pps: ["programming"],
};

/** The subject a few words point at: code ("CSET207"), name, or its initials ("DBMS", "OS"). */
export function findSubject<T extends { name: string; code: string }>(list: T[], words: string): T | null {
  const w = ` ${norm(words)} `;
  if (!w.trim()) return null;
  let best: T | null = null;
  let score = 0;
  for (const s of list) {
    const name = norm(cleanName(s.name));
    const code = norm(s.code);
    const initials = name
      .split(" ")
      .filter((x) => x.length > 2 && !["and", "the", "for", "lab"].includes(x))
      .map((x) => x[0])
      .join("");
    let sc = 0;
    const short = w
      .split(" ")
      .some((x) => SHORT[x]?.some((part) => name.includes(part)));
    if (code && w.includes(` ${code} `)) sc = 100;
    else if (name && w.includes(name)) sc = 90;
    else if (short) sc = 85;
    else if (initials.length >= 2 && w.includes(` ${initials} `)) sc = 80;
    else {
      // Any long word of the name ("database", "operating", "maths").
      const hit = name.split(" ").filter((x) => x.length >= 4 && w.includes(` ${x} `)).length;
      if (hit) sc = 40 + hit * 10;
    }
    if (sc > score) {
      score = sc;
      best = s;
    }
  }
  return best;
}

export async function getAttendance(subject?: string): Promise<ToolResult> {
  const camu = collegeNow().camu;
  const t = await target();
  if (!camu?.connected || !camu.subjects?.length) {
    return { data: { connected: false, note: "Camu is not connected, so attendance is unknown." } };
  }
  const subjects = camu.subjects.map((s) => ({ name: cleanName(s.name), code: s.code, ...stat(s.present, s.total, t) }));
  const overall = camu.overall ? stat(camu.overall.present, camu.overall.total, t) : null;
  const focus = subject ? findSubject(subjects, subject) : null;
  return {
    data: { target: t, overall, subjects: focus ? [focus] : subjects },
    card: { kind: "attendance", overall, subjects, target: t, focus: focus?.code || focus?.name },
  };
}

/** "If I skip N classes of X": the percentage after, against the target. */
export async function whatIfSkip(skip: number, subject?: string): Promise<ToolResult> {
  const camu = collegeNow().camu;
  const t = await target();
  if (!camu?.connected) return { data: { connected: false } };
  const subs = (camu.subjects ?? []).map((s) => ({ ...s, name: cleanName(s.name) }));
  const sub = subject ? findSubject(subs, subject) : null;
  const present = sub ? sub.present : (camu.overall?.present ?? 0);
  const total = sub ? sub.total : (camu.overall?.total ?? 0);
  if (total <= 0) return { data: { known: false } };
  const before = (present / total) * 100;
  const after = (present / (total + skip)) * 100;
  const name = sub ? sub.name : "Overall";
  return {
    data: { subject: name, skip, before: +before.toFixed(1), after: +after.toFixed(1), target: t, safe: after >= t },
    card: { kind: "whatif", name, before, after, skip, target: t },
  };
}

export function getTimetable(date: string): ToolResult {
  const camu = collegeNow().camu;
  const today = toDateStr();
  const label = relativeDayLabel(date, today) || WEEKDAYS[weekdayOf(date)];
  if (!camu?.connected) return { data: { connected: false } };
  const holiday = holidayOn(camu, date);
  const items = classesOn(camu, date).map((c) => ({
    from: c.from,
    to: c.to,
    name: cleanName(c.name),
    room: c.room,
    kind: c.kind,
  }));
  const published = (camu.periods ?? []).some((p) => p.date >= date);
  return {
    data: { date, day: fmtDayLong(date), holiday: holiday?.title ?? null, published, classes: items },
    card: { kind: "classes", date, label, items },
  };
}

export function getMess(): ToolResult {
  const caf = collegeNow().camu?.cafeteria;
  const meals = (caf?.meals ?? []).map((m) => ({ meal: m.meal, label: m.label, items: m.items }));
  const date = caf?.date?.slice(0, 10) ?? toDateStr();
  if (!meals.length) return { data: { known: false, note: "No mess menu from Camu yet." } };
  return { data: { date, meals }, card: { kind: "mess", date, meals } };
}

export async function listTasks(when: "today" | "week" | "overdue" | "all" = "all"): Promise<ToolResult> {
  const today = toDateStr();
  const week = addDays(today, 7);
  const all = await db.tasks.filter((t) => !t.deletedAt && !t.done).toArray();
  const pick = all
    .filter((t) => {
      if (when === "today") return t.dueDate === today;
      if (when === "overdue") return !!t.dueDate && t.dueDate < today;
      if (when === "week") return !!t.dueDate && t.dueDate <= week;
      return true;
    })
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 12);
  const label = { today: "Due today", week: "Due this week", overdue: "Overdue", all: "Pending" }[when];
  const items = pick.map((t) => ({ id: t.id, title: t.title, due: t.dueDate, kind: t.kind }));
  return { data: { label, count: items.length, tasks: items }, card: { kind: "tasks", label, items } };
}

export async function listPasses(): Promise<ToolResult> {
  const passes = await v3db.passes.orderBy("createdAt").reverse().limit(5).toArray();
  return {
    data: passes.map((p) => ({ kind: p.kind, from: `${p.fromDate} ${p.fromTime}`, to: `${p.toDate} ${p.toTime}`, status: p.status })),
    card: { kind: "passes", ids: passes.map((p) => p.id) },
  };
}

/** A day out is one day, back by 7 PM; a leave never ends before it starts. */
export function tidyPass(d: PassDraft): PassDraft {
  const p = { ...d };
  if (p.kind === "dayout") {
    p.toDate = p.fromDate;
    if (!p.toTime || p.toTime > DAYOUT_END) p.toTime = DAYOUT_END;
  } else {
    if (p.toDate < p.fromDate) p.toDate = p.fromDate;
    if (p.toTime > DAYOUT_END) p.toTime = DAYOUT_END;
  }
  if (!p.reason || p.reason === ".") p.reason = p.kind === "dayout" ? "Personal work" : "Going home";
  return p;
}

/** Why an outpass can't be saved as it is, or null. */
export function passProblem(p: PassDraft, hasProof: boolean, now = new Date()): string | null {
  const today = toDateStr(now);
  if (p.fromDate < today) return "The start date has already gone.";
  if (p.toDate < p.fromDate || (p.toDate === p.fromDate && p.toTime <= p.fromTime)) return "It ends before it starts.";
  if (p.toTime > DAYOUT_END) return "A pass has to end by 7:00 pm — MyCamu won't take later.";
  if (p.fromTime < PASS_START) return "A pass can start from 6:00 am.";
  if (p.kind === "dayout" && p.fromDate !== p.toDate) return "A day out is for one day — use a leave for more.";
  const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (p.toDate === today && p.toTime <= nowHm) return "That time has already gone today.";
  if (needsProof(p) && !hasProof) return "A leave needs the parent-approval mail screenshot.";
  return null;
}

/** Carry out a confirmed action. Returns the new record's id. */
export async function runAction(a: Action, proof?: Blob, via: PassRecord["via"] = "assistant"): Promise<string> {
  if (a.type === "task") {
    const t = await addTask({ title: a.title, dueDate: a.dueDate, dueTime: a.dueTime, kind: "assignment" });
    return t.id;
  }
  return savePass(a.draft, proof, via);
}

export async function savePass(draft: PassDraft, proof: Blob | undefined, via: PassRecord["via"]): Promise<string> {
  const now = Date.now();
  const rec: PassRecord = {
    ...tidyPass(draft),
    id: newId(),
    createdAt: now,
    updatedAt: now,
    status: "saved",
    via,
    proof,
    proofName: proof ? "mail-screenshot" : undefined,
  };
  await v3db.passes.put(rec);
  return rec.id;
}

/** JSON-schema tool list for a real model (OpenAI-compatible "tools"). */
export const TOOL_SPECS = [
  {
    name: "get_attendance",
    description: "The student's attendance from Camu: overall and per subject, with how many classes they can still miss (canMiss) or must attend (mustAttend) to stay at their target.",
    parameters: { type: "object", properties: { subject: { type: "string", description: "Subject name, code or short form (e.g. DBMS). Omit for all." } } },
  },
  {
    name: "what_if_skip",
    description: "Attendance percentage after skipping some classes, overall or for one subject.",
    parameters: {
      type: "object",
      properties: { skip: { type: "integer", minimum: 1 }, subject: { type: "string" } },
      required: ["skip"],
    },
  },
  {
    name: "get_timetable",
    description: "Classes on a date (YYYY-MM-DD), from Camu.",
    parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] },
  },
  { name: "get_mess_menu", description: "Today's mess (cafeteria) menu from Camu.", parameters: { type: "object", properties: {} } },
  {
    name: "list_tasks",
    description: "The student's pending tasks (assignments, exams, reminders).",
    parameters: { type: "object", properties: { when: { type: "string", enum: ["today", "week", "overdue", "all"] } } },
  },
  {
    name: "propose_task",
    description: "Propose adding a task or reminder. The student confirms with a tap; nothing is added before that.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD or empty" },
        dueTime: { type: "string", description: "HH:MM 24h or empty" },
      },
      required: ["title"],
    },
  },
  {
    name: "propose_outpass",
    description:
      "Propose a hostel outpass. kind 'dayout' = same day, back by 19:00. kind 'leave' = leave out pass over days; leaveType Leave/On Duty/Medical; a plain Leave or Medical needs the parent-approval mail screenshot (ask the student to send it). The student confirms with a tap; DockIn then saves it and opens MyCamu with the details. Approval is never done by DockIn.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["dayout", "leave"] },
        leaveType: { type: "string", enum: ["Leave", "On Duty", "Medical"] },
        fromDate: { type: "string" },
        fromTime: { type: "string" },
        toDate: { type: "string" },
        toTime: { type: "string" },
        reason: { type: "string" },
      },
      required: ["kind", "fromDate", "fromTime", "toDate", "toTime", "reason"],
    },
  },
  { name: "list_outpasses", description: "The student's recent outpasses and their status.", parameters: { type: "object", properties: {} } },
] as const;

/** Run a tool a real model asked for. Actions come back as a confirm card, never done. */
export async function runTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const s = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
  switch (name) {
    case "get_attendance":
      return getAttendance(s("subject") || undefined);
    case "what_if_skip":
      return whatIfSkip(Math.max(1, Math.min(60, Number(args.skip) || 1)), s("subject") || undefined);
    case "get_timetable":
      return getTimetable(/^\d{4}-\d{2}-\d{2}$/.test(s("date")) ? s("date") : toDateStr());
    case "get_mess_menu":
      return getMess();
    case "list_tasks":
      return listTasks((["today", "week", "overdue", "all"].includes(s("when")) ? s("when") : "all") as "all");
    case "list_outpasses":
      return listPasses();
    case "propose_task": {
      const action: Action = {
        type: "task",
        title: s("title").slice(0, 120) || "Reminder",
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(s("dueDate")) ? s("dueDate") : null,
        dueTime: /^\d{2}:\d{2}$/.test(s("dueTime")) ? s("dueTime") : null,
      };
      return { data: { proposed: true, waitingForTap: true }, card: { kind: "confirm", action, state: "waiting" } };
    }
    case "propose_outpass": {
      const kind = s("kind") === "leave" ? "leave" : "dayout";
      const lt = s("leaveType");
      const draft = tidyPass({
        kind,
        leaveType: lt === "Medical" || lt === "On Duty" ? lt : "Leave",
        fromDate: s("fromDate") || toDateStr(),
        fromTime: s("fromTime") || "10:00",
        toDate: s("toDate") || s("fromDate") || toDateStr(),
        toTime: s("toTime") || DAYOUT_END,
        reason: s("reason"),
      });
      return {
        data: { proposed: true, waitingForTap: true, needsProof: needsProof(draft) },
        card: { kind: "confirm", action: { type: "outpass", draft }, state: "waiting" },
      };
    }
    default:
      return { data: { error: `No tool called ${name}` } };
  }
}
