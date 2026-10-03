import type { Priority, Subject, Task, TaskKind } from "./types";
import { addDays, fmtDay, fmtTime, fromDateStr, weekdayOf } from "./dates";

export interface KindMeta {
  id: TaskKind;
  label: string;
  tint: string;
  ink: string;
}

export const KINDS: KindMeta[] = [
  { id: "assignment", label: "Assignment", tint: "bg-accent-soft", ink: "text-accent" },
  { id: "exam", label: "Exam", tint: "bg-rose-soft", ink: "text-rose" },
  { id: "quiz", label: "Quiz", tint: "bg-warn-soft", ink: "text-warn" },
  { id: "project", label: "Project", tint: "bg-violet-soft", ink: "text-violet" },
  { id: "personal", label: "Personal", tint: "bg-safe-soft", ink: "text-safe" },
];
export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<TaskKind, KindMeta>;

export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", med: "Medium", high: "High" };

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = fromDateStr(from).getTime();
  const b = fromDateStr(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export type Bucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  none: "No date",
};
const BUCKET_ORDER: Bucket[] = ["overdue", "today", "tomorrow", "week", "later", "none"];

export function bucketOf(task: Task, today: string): Bucket {
  if (!task.dueDate) return "none";
  const d = daysBetween(today, task.dueDate);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 7) return "week";
  return "later";
}

const prioRank: Record<Priority, number> = { high: 0, med: 1, low: 2 };

export function compareTasks(a: Task, b: Task): number {
  const da = a.dueDate ?? "9999-99-99";
  const db = b.dueDate ?? "9999-99-99";
  return (
    da.localeCompare(db) ||
    (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") ||
    prioRank[a.priority] - prioRank[b.priority] ||
    a.createdAt - b.createdAt
  );
}

/**
 * The list, grouped by when it is due.
 *
 * `keep` is the set of tasks that were ticked a moment ago. A task that
 * vanishes the instant you tick it takes the proof of what you just did with
 * it, and leaves you wondering whether the tap registered — so a freshly done
 * one stays where it was, struck through, until the screen is next opened.
 */
export function groupPending(
  tasks: Task[],
  today: string,
  keep?: ReadonlySet<string>,
): { bucket: Bucket; items: Task[] }[] {
  const shown = tasks
    .filter((t) => !t.done || keep?.has(t.id))
    .sort((a, b) => Number(a.done) - Number(b.done) || compareTasks(a, b));
  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: shown.filter((t) => bucketOf(t, today) === bucket),
  })).filter((g) => g.items.length > 0);
}

/** "Due today", "Overdue by 2 days", "Fri, 9 Oct · 11:59 pm". */
export function dueLabel(task: Task, today: string): string {
  if (!task.dueDate) return "No deadline";
  const d = daysBetween(today, task.dueDate);
  const time = task.dueTime ? ` · ${fmtTime(task.dueTime)}` : "";
  if (d < 0) return `Overdue by ${-d} ${-d === 1 ? "day" : "days"}`;
  if (d === 0) return `Today${time}`;
  if (d === 1) return `Tomorrow${time}`;
  return `${fmtDay(task.dueDate)}${time}`;
}

export function subtaskProgress(task: Task): { done: number; total: number } {
  return { done: task.subtasks.filter((s) => s.done).length, total: task.subtasks.length };
}

export function countdownText(days: number): string {
  if (days < 0) return "Done";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

// ---------- quick add ("DBMS assignment tomorrow !") ----------

export interface QuickParse {
  title: string;
  kind: TaskKind;
  subjectId: string | null;
  dueDate: string | null;
  priority: Priority;
}

const WEEKDAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTH_WORDS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const KIND_WORDS: [RegExp, TaskKind][] = [
  [/^(exam|exams|midsem|endsem|mid-sem|end-sem|midterm|test)$/, "exam"],
  [/^(quiz|viva)$/, "quiz"],
  [/^(project|presentation|demo)$/, "project"],
  [/^(assignment|assignments|hw|homework|lab|record|report|worksheet)$/, "assignment"],
];

function nextWeekday(today: string, target: number): string {
  const diff = (target - weekdayOf(today) + 7) % 7 || 7;
  return addDays(today, diff);
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseQuick(input: string, subjects: Subject[], today: string): QuickParse {
  const raw = input.trim().replace(/\s+/g, " ");
  const words = raw.split(" ");
  const used = new Set<number>();
  let dueDate: string | null = null;
  let kind: TaskKind = "assignment";
  let kindSet = false;
  let priority: Priority = "med";

  const year = Number(today.slice(0, 4));

  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/[.,]/g, "");
    const next = (words[i + 1] ?? "").toLowerCase().replace(/[.,]/g, "");

    if (w === "!" || w === "!!" || w === "urgent" || w === "important") {
      priority = "high";
      used.add(i);
    } else if (w.endsWith("!") && w.length > 1 && !/\w+!+\w/.test(w)) {
      priority = "high";
      words[i] = words[i].replace(/!+$/, "");
    } else if (!dueDate && (w === "today" || w === "tonight" || w === "tdy")) {
      dueDate = today;
      used.add(i);
    } else if (!dueDate && (w === "tomorrow" || w === "tmrw" || w === "tmr" || w === "tom")) {
      dueDate = addDays(today, 1);
      used.add(i);
    } else if (!dueDate && w === "next" && next === "week") {
      dueDate = addDays(today, 7);
      used.add(i);
      used.add(i + 1);
    } else if (!dueDate && w === "in" && /^\d{1,2}$/.test(next) && /^(day|days|d)$/.test((words[i + 2] ?? "").toLowerCase())) {
      dueDate = addDays(today, Number(next));
      used.add(i);
      used.add(i + 1);
      used.add(i + 2);
    } else if (!dueDate && w in WEEKDAY_WORDS && !(w === "mar" || w === "may")) {
      dueDate = nextWeekday(today, WEEKDAY_WORDS[w]);
      used.add(i);
    } else if (!dueDate && /^\d{1,2}(st|nd|rd|th)?$/.test(w) && next in MONTH_WORDS) {
      const day = parseInt(w, 10);
      let iso = isoOf(year, MONTH_WORDS[next], day);
      if (iso < today) iso = isoOf(year + 1, MONTH_WORDS[next], day);
      if (day >= 1 && day <= 31) {
        dueDate = iso;
        used.add(i);
        used.add(i + 1);
      }
    } else if (!dueDate && w in MONTH_WORDS && /^\d{1,2}(st|nd|rd|th)?$/.test(next)) {
      const day = parseInt(next, 10);
      let iso = isoOf(year, MONTH_WORDS[w], day);
      if (iso < today) iso = isoOf(year + 1, MONTH_WORDS[w], day);
      if (day >= 1 && day <= 31) {
        dueDate = iso;
        used.add(i);
        used.add(i + 1);
      }
    } else if (!kindSet) {
      const hit = KIND_WORDS.find(([re]) => re.test(w));
      if (hit) {
        kind = hit[1];
        kindSet = true; // kept in the title on purpose: "DBMS assignment 3"
      }
    }
  }

  let title = words.filter((_, i) => !used.has(i)).join(" ").replace(/\b(by|on|due|for)\s*$/i, "").trim();
  if (!title) title = raw.replace(/!+/g, "").trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const lower = ` ${raw.toLowerCase().replace(/[^a-z0-9&+ ]/g, " ")} `;
  let subjectId: string | null = null;
  for (const s of subjects) {
    const code = s.code.toLowerCase().replace(/[^a-z0-9&+]/g, "");
    if (code && lower.includes(` ${code} `)) {
      subjectId = s.id;
      break;
    }
  }
  if (!subjectId) {
    for (const s of subjects) {
      const name = s.name.toLowerCase();
      if (name.length > 3 && lower.includes(` ${name} `)) {
        subjectId = s.id;
        break;
      }
    }
  }
  return { title, kind, subjectId, dueDate, priority };
}
