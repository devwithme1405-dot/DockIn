/**
 * The reminders the phone should fire over the next day or so, worked out from
 * the same data the screens show: a class about to start, a task due, and a
 * morning nudge when attendance has slipped below target. The app builds the
 * whole list; the phone (lib/native scheduleReminders) sets the alarms.
 */

import type { ReminderItem } from "./native";
import type { AttendanceSummary, Subject } from "./types";
import type { ViewSession } from "./college";
import type { Task } from "./types";
import { fmtTime, toDateStr } from "./dates";
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

type SubjectStat = { subject: Subject; summary: AttendanceSummary };

export interface ReminderInput {
  sessions: ViewSession[];
  subjects: Subject[];
  tasks: Task[];
  overall: { pct: number | null; state: "none" | "safe" | "warn" | "danger" } | null;
  /** Per-subject numbers, so a class reminder can say whether to go. */
  stats?: SubjectStat[];
  target: number;
  today: string;
  now: number;
}

const pctOf = (s: AttendanceSummary) => (s.pct === null ? null : Math.round(s.pct));
const classes = (n: number) => `${n} ${n === 1 ? "class" : "classes"}`;

/** What to say about going to a class, from that subject's own numbers. */
export function adviceFor(s: AttendanceSummary | undefined, target: number): { go: boolean; line: string } {
  if (!s || s.state === "none" || s.pct === null) return { go: true, line: "" };
  const p = pctOf(s);
  if (s.state === "danger") {
    return {
      go: true,
      line: Number.isFinite(s.mustAttend)
        ? `Attendance is only ${p}% — attend the next ${classes(s.mustAttend)} to reach ${target}%.`
        : `Attendance is only ${p}% — below ${target}%.`,
    };
  }
  if (!Number.isFinite(s.canMiss) || s.canMiss <= 0) {
    return { go: true, line: `You're at ${p}% — no bunk left, don't skip this one.` };
  }
  return { go: false, line: `You're at ${p}%. You can miss ${s.canMiss} more ${s.canMiss === 1 ? "class" : "classes"} if you need to.` };
}

/**
 * Build the reminder list. Ids are 1..N for this batch — the phone cancels the
 * previous batch wholesale, so they only need to be unique here.
 */
export function buildReminders({ sessions, subjects, tasks, overall, stats, target, today, now }: ReminderInput): ReminderItem[] {
  const items: ReminderItem[] = [];
  let id = 1;
  const name = new Map(subjects.map((s) => [s.id, s.name]));
  const summary = new Map((stats ?? []).map((x) => [x.subject.id, x.summary]));
  const horizon = now + 3 * 24 * 3_600_000;

  // Classes that will actually happen, in order, so each knows the one before it.
  const live = sessions
    .filter((s) => s.status !== "cancelled" && s.status !== "holiday" && !holidayInfo(s.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  for (let i = 0; i < live.length; i++) {
    const s = live[i];
    const start = at(s.date, s.start);
    if (start <= now || start > horizon) continue;
    const subject = name.get(s.subjectId) ?? "Class";
    const advice = adviceFor(summary.get(s.subjectId), target);
    const place = `${clock(s.start)}${s.room ? ` · ${s.room}` : ""}`;
    const prev = i > 0 && live[i - 1].date === s.date ? live[i - 1] : null;
    const prevEnd = prev ? at(prev.date, prev.end) : 0;
    const gapMin = prev ? (start - prevEnd) / 60_000 : Infinity;

    // The class before just ended: say where to go next, and whether it matters.
    if (prev && gapMin >= 0 && gapMin <= 180 && prevEnd > now) {
      const prevName = name.get(prev.subjectId) ?? "Class";
      items.push({
        id: id++,
        at: prevEnd + 60_000,
        title: advice.go ? `${prevName} done — next, go to ${subject}` : `${prevName} done — next is ${subject}`,
        body: `${place}. ${advice.line}`.trim(),
        path: "/timetable",
      });
    }

    // Right before it starts. Back-to-back classes get it a minute before, so it
    // does not arrive while the previous one is still on.
    const lead = gapMin <= 15 ? 60_000 : 10 * 60_000;
    const when = start - lead;
    if (when > now) {
      items.push({
        id: id++,
        at: when,
        title: advice.go
          ? `${subject} ${lead === 60_000 ? "starts now" : "in 10 minutes"} — go`
          : `${subject} ${lead === 60_000 ? "starts now" : "in 10 minutes"}`,
        body: `${place}. ${advice.line}`.trim(),
        path: "/timetable",
      });
    }
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
    // A deadline tonight that is still open gets a last call half an hour before.
    if (t.dueTime && b === "today") {
      const last = at(t.dueDate, t.dueTime) - 30 * 60_000;
      if (last > now) {
        items.push({
          id: id++,
          at: last,
          title: `${t.title} is due in 30 mins`,
          body: "Still not done. Finish and submit it now.",
          path: "/tasks",
        });
      }
    }
  }

  // Morning: the subjects you have today that are below target, by name.
  const morning = nextMorning(now);
  const mDate = toDateStr(new Date(morning));
  const todaysLow = [
    ...new Set(
      live
        .filter((s) => s.date === mDate && summary.get(s.subjectId)?.state === "danger")
        .map((s) => s.subjectId),
    ),
  ];
  if (todaysLow.length) {
    const first = summary.get(todaysLow[0])!;
    items.push({
      id: id++,
      at: morning,
      title: "Good morning — don't skip today",
      body:
        todaysLow.length === 1
          ? `${name.get(todaysLow[0])} is at ${pctOf(first)}%. You have it today.`
          : `${todaysLow.map((x) => `${name.get(x)} ${pctOf(summary.get(x)!)}%`).join(", ")} — all below ${target}%, all today.`,
      path: "/attendance",
    });
  } else if (overall && overall.pct !== null && overall.state === "danger") {
    items.push({
      id: id++,
      at: morning,
      title: "Attendance is low",
      body: `You are at ${Math.round(overall.pct)}% — below your ${target}%.`,
      path: "/attendance",
    });
  }

  return items.sort((a, b) => a.at - b.at).slice(0, 120).map((x, i) => ({ ...x, id: i + 1 }));
}
