/**
 * Your own reminders on a task: when each one fires, and how to say it.
 * Pure functions — the reminder list (lib/reminders) and the task form use them.
 */

import type { Task, TaskReminder } from "./types";
import { addDays, toDateStr } from "./dates";

/** Local epoch ms for a date + "HH:MM". */
function at(date: string, hm: string): number {
  return new Date(`${date}T${hm}:00`).getTime();
}

/** When the task is due, as a moment (no time on the deadline = end of that day). */
export function dueMoment(task: Pick<Task, "dueDate" | "dueTime">): number | null {
  if (!task.dueDate) return null;
  return at(task.dueDate, task.dueTime ?? "23:59");
}

/** Daily reminders look this far ahead (the app tops the list up every time it opens). */
export const DAILY_AHEAD_DAYS = 14;

/**
 * Every moment a reminder fires between `now` and `until`. Daily ones stop at the
 * deadline; nothing fires for a task that is done.
 */
export function reminderTimes(task: Task, r: TaskReminder, now: number, until: number): number[] {
  if (task.done) return [];
  const due = dueMoment(task);
  const keep = (t: number) => t > now && t <= until;
  if (r.kind === "at") {
    const t = at(r.date, r.time);
    return keep(t) ? [t] : [];
  }
  if (r.kind === "before") {
    if (due === null) return [];
    const t = due - r.minutes * 60_000;
    return keep(t) ? [t] : [];
  }
  const out: number[] = [];
  const today = toDateStr(new Date(now));
  for (let i = 0; i <= DAILY_AHEAD_DAYS; i++) {
    const day = addDays(today, i);
    if (r.days && r.days.length && !r.days.includes(new Date(`${day}T12:00:00`).getDay())) continue;
    const t = at(day, r.time);
    if (due !== null && t > due) break;
    if (keep(t)) out.push(t);
  }
  return out;
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}

function dayWord(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  const d = new Date(`${date}T12:00:00`);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })}`;
}

export function beforeWord(minutes: number): string {
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return d === 1 ? "1 day before" : `${d} days before`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour before" : `${h} hours before`;
  }
  return `${minutes} min before`;
}

/** "Tomorrow, 6 PM" · "Every day, 9 PM" · "Mon, Wed · 8 AM" · "1 day before". */
export function describeReminder(r: TaskReminder, today: string): string {
  if (r.kind === "at") return `${dayWord(r.date, today)}, ${clock(r.time)}`;
  if (r.kind === "before") return beforeWord(r.minutes);
  if (!r.days || r.days.length === 0 || r.days.length === 7) return `Every day, ${clock(r.time)}`;
  const sorted = [...r.days].sort((a, b) => a - b);
  if (sorted.join() === "1,2,3,4,5") return `Weekdays, ${clock(r.time)}`;
  return `${sorted.map((d) => DAY_SHORT[d]).join(", ")} · ${clock(r.time)}`;
}

/** A one-line summary for a task row: "Daily 9 PM", "Tomorrow 6 PM", "3 reminders". */
export function reminderSummary(task: Task, today: string): string | null {
  const list = task.reminders ?? [];
  if (!list.length || task.done) return null;
  if (list.length > 1) return `${list.length} reminders`;
  const r = list[0];
  if (r.kind === "daily" && (!r.days || r.days.length === 0 || r.days.length === 7)) return `Daily ${clock(r.time)}`;
  return describeReminder(r, today);
}

/** Same reminder twice is one reminder. */
export function sameReminder(a: TaskReminder, b: TaskReminder): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "at" && b.kind === "at") return a.date === b.date && a.time === b.time;
  if (a.kind === "before" && b.kind === "before") return a.minutes === b.minutes;
  if (a.kind === "daily" && b.kind === "daily") {
    const k = (d?: number[]) => (d && d.length && d.length < 7 ? [...d].sort().join() : "all");
    return a.time === b.time && k(a.days) === k(b.days);
  }
  return false;
}

/** Keeps only reminders that still mean something (well-formed). */
export function cleanReminders(list: unknown): TaskReminder[] {
  if (!Array.isArray(list)) return [];
  const hm = /^\d{2}:\d{2}$/;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const out: TaskReminder[] = [];
  for (const x of list.slice(0, 12)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Partial<TaskReminder> & { kind?: string };
    const id = typeof r.id === "string" && r.id ? r.id.slice(0, 40) : Math.random().toString(36).slice(2, 12);
    if (r.kind === "at" && typeof r.date === "string" && day.test(r.date) && typeof r.time === "string" && hm.test(r.time)) {
      out.push({ id, kind: "at", date: r.date, time: r.time });
    } else if (r.kind === "daily" && typeof r.time === "string" && hm.test(r.time)) {
      const days = Array.isArray(r.days) ? r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : undefined;
      out.push({ id, kind: "daily", time: r.time, ...(days && days.length ? { days: [...new Set(days)] } : {}) });
    } else if (r.kind === "before" && typeof r.minutes === "number" && r.minutes > 0 && r.minutes <= 30 * 1440) {
      out.push({ id, kind: "before", minutes: Math.round(r.minutes) });
    }
  }
  return out;
}
