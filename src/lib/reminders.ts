/**
 * The reminders the phone should fire over the next day or so, worked out from
 * the same data the screens show: a class about to start, a task due, and a
 * morning nudge when attendance has slipped below target. The app builds the
 * whole list; the phone (lib/native scheduleReminders) sets the alarms.
 */

import type { ReminderItem } from "./native";
import type { Subject } from "./types";
import type { ViewSession } from "./college";
import type { Task } from "./types";
import { fmtTime } from "./dates";
import { bucketOf } from "./tasks";
import { holidayInfo } from "./academic";

/** Local epoch ms for a date + "HH:MM". */
function at(date: string, hm: string): number {
  return new Date(`${date}T${hm}:00`).getTime();
}

/** The next 8am from now — today's if it is still ahead, otherwise tomorrow's. */
function nextMorning(now: number): number {
  const d = new Date(now);
  const eight = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0).getTime();
  return eight > now ? eight : eight + 86_400_000;
}

const clock = (t: string) => fmtTime(t).toUpperCase();

export interface ReminderInput {
  sessions: ViewSession[];
  subjects: Subject[];
  tasks: Task[];
  overall: { pct: number | null; state: "none" | "safe" | "warn" | "danger" } | null;
  target: number;
  today: string;
  now: number;
}

/**
 * Build the reminder list. Ids are 1..N for this batch — the phone cancels the
 * previous batch wholesale, so they only need to be unique here.
 */
export function buildReminders({ sessions, subjects, tasks, overall, target, today, now }: ReminderInput): ReminderItem[] {
  const items: ReminderItem[] = [];
  let id = 1;
  const name = new Map(subjects.map((s) => [s.id, s.name]));
  const horizon = now + 36 * 3_600_000;

  // A class is starting — ten minutes before, so there is time to walk over.
  for (const s of sessions) {
    if (s.status === "cancelled" || s.status === "holiday") continue;
    if (holidayInfo(s.date)) continue;
    const start = at(s.date, s.start);
    const when = start - 10 * 60_000;
    if (when <= now || start > horizon) continue;
    items.push({
      id: id++,
      at: when,
      title: "Class in 10 minutes",
      body: `${name.get(s.subjectId) ?? "Class"} · ${clock(s.start)}${s.room ? ` · ${s.room}` : ""}`,
      path: "/timetable",
    });
  }

  // A task is due today or tomorrow — an hour before a timed deadline, else 8am.
  for (const t of tasks) {
    if (t.done || !t.dueDate) continue;
    const b = bucketOf(t, today);
    if (b !== "today" && b !== "tomorrow") continue;
    const when = t.dueTime ? at(t.dueDate, t.dueTime) - 60 * 60_000 : at(t.dueDate, "08:00");
    if (when <= now || when > horizon) continue;
    items.push({
      id: id++,
      at: when,
      title: t.kind === "exam" ? "Exam coming up" : "Task due",
      body: `${t.title}${t.dueTime ? ` · ${clock(t.dueTime)}` : b === "today" ? " · today" : " · tomorrow"}`,
      path: "/tasks",
    });
  }

  // Attendance has dropped below target — a quiet morning nudge.
  if (overall && overall.pct !== null && overall.state === "danger") {
    items.push({
      id: id++,
      at: nextMorning(now),
      title: "Attendance is low",
      body: `You are at ${Math.round(overall.pct)}% — below your ${target}%.`,
      path: "/attendance",
    });
  }

  return items.slice(0, 48);
}
