import type { CalEvent, Session, Slot, Task } from "./types";
import { addDays, fromDateStr, toDateStr, weekdayOf } from "./dates";

/** Six Monday-first weeks covering the month, as date strings. */
export function monthGrid(key: string): string[] {
  const [y, m] = key.split("-").map(Number);
  const first = toDateStr(new Date(y, m - 1, 1));
  const lead = (weekdayOf(first) + 6) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export interface DayInfo {
  holiday: CalEvent[];
  events: CalEvent[];
  exams: Task[];
  due: Task[];
  /** Past-day attendance summary for the little status bar. */
  attendance: "none" | "all" | "some" | "missed";
}

export function emptyDay(): DayInfo {
  return { holiday: [], events: [], exams: [], due: [], attendance: "none" };
}

export function buildDayMap(
  tasks: Task[],
  events: CalEvent[],
  sessions: Session[],
  from: string,
  to: string,
): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>();
  const get = (d: string) => {
    let v = map.get(d);
    if (!v) map.set(d, (v = emptyDay()));
    return v;
  };
  for (const t of tasks) {
    if (!t.dueDate || t.dueDate < from || t.dueDate > to) continue;
    (t.kind === "exam" ? get(t.dueDate).exams : get(t.dueDate).due).push(t);
  }
  for (const e of events) {
    const start = e.date < from ? from : e.date;
    const end = e.endDate > to ? to : e.endDate;
    for (let d = start, n = 0; d <= end && n < 400; d = addDays(d, 1), n++) {
      (e.kind === "holiday" ? get(d).holiday : get(d).events).push(e);
    }
  }
  const byDate = new Map<string, Session[]>();
  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  }
  for (const [d, list] of byDate) {
    const counted = list.filter((s) => s.status === "present" || s.status === "absent");
    if (counted.length === 0) continue;
    const absent = counted.filter((s) => s.status === "absent").length;
    get(d).attendance = absent === 0 ? "all" : absent === counted.length ? "missed" : "some";
  }
  return map;
}

/** Slots that happen on a given date (used for days with no sessions yet). */
export function slotsOn(slots: Slot[], date: string): Slot[] {
  const wd = weekdayOf(date);
  return slots.filter((s) => s.weekday === wd).sort((a, b) => a.start.localeCompare(b.start));
}

export function isWeekend(date: string): boolean {
  const d = fromDateStr(date).getDay();
  return d === 0 || d === 6;
}

/** Fixed-date national holidays in India. Bennett's own calendar may differ, so these are optional. */
export function nationalHolidays(year: number): { title: string; date: string }[] {
  return [
    { title: "Republic Day", date: `${year}-01-26` },
    { title: "Independence Day", date: `${year}-08-15` },
    { title: "Gandhi Jayanti", date: `${year}-10-02` },
    { title: "Christmas", date: `${year}-12-25` },
  ];
}
