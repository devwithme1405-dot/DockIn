// Every record carries sync-ready fields so the local database can later be
// mirrored to Supabase without changing the shape of the data.
export interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export type ThemePref = "system" | "light" | "dark";

export interface Profile {
  id: "me";
  name: string;
  /** Required attendance, in percent (Bennett default is 75). */
  target: number;
  theme: ThemePref;
  onboarded: boolean;
  /** Monthly spending budget in rupees (0 or missing = not set). */
  budget?: number;
  /** Profile picture, see lib/avatars.ts ("i:3" or "e:🦊:3"). */
  avatar?: string;
  /** Text size for the whole app: 0.9 to 1.25. */
  textScale?: number;
  /** Course or branch, e.g. "BTech CSE". */
  branch?: string;
  /** Year of study, 1 to 5. */
  year?: number;
  /** Section or batch, e.g. "E1". */
  section?: string;
  /** One line a friend sees on your profile. */
  bio?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Subject extends Base {
  name: string;
  code: string;
  color: string;
  /** Classes already attended / held before starting to use DockIn. */
  baseAttended?: number;
  baseTotal?: number;
}

export type ClassKind = "lecture" | "practical";

export interface Slot extends Base {
  subjectId: string;
  /** 0 = Sunday ... 6 = Saturday (same as JavaScript's Date.getDay). */
  weekday: number;
  start: string; // "HH:MM" 24h
  end: string;
  kind: ClassKind;
  room?: string;
  /** How many attendance units this class is worth (default 1). */
  weight: number;
}

export type SessionStatus =
  | "unmarked"
  | "present"
  | "absent"
  | "cancelled"
  | "holiday";

export interface Session extends Base {
  /** Deterministic id: `${slotId}:${date}` so a day is never generated twice. */
  slotId: string;
  subjectId: string;
  date: string; // "YYYY-MM-DD" local date
  start: string;
  end: string;
  kind: ClassKind;
  weight: number;
  status: SessionStatus;
}

export type AttendanceState = "none" | "safe" | "warn" | "danger";

export interface AttendanceSummary {
  attended: number;
  total: number;
  /** Percentage 0-100, or null when no class has been marked yet. */
  pct: number | null;
  /** Classes that can still be missed while staying at or above the target. */
  canMiss: number;
  /** Classes that must be attended in a row to get back to the target. */
  mustAttend: number;
  state: AttendanceState;
}

export type ExpenseCategory =
  | "food"
  | "snacks"
  | "travel"
  | "shopping"
  | "study"
  | "bills"
  | "fun"
  | "other";

export interface Expense extends Base {
  /** Amount in rupees (decimals allowed). */
  amount: number;
  category: ExpenseCategory;
  note: string;
  date: string; // "YYYY-MM-DD" local date
}

export type TaskKind = "assignment" | "exam" | "project" | "quiz" | "personal";
export type Priority = "low" | "med" | "high";

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

export interface Task extends Base {
  title: string;
  notes: string;
  kind: TaskKind;
  subjectId: string | null;
  /** "YYYY-MM-DD", or null for a task without a deadline. */
  dueDate: string | null;
  /** Optional "HH:MM" (exam start, or a deadline time). */
  dueTime: string | null;
  /** Exam hall / venue, optional. */
  room: string;
  priority: Priority;
  done: boolean;
  doneAt: number | null;
  /** Checklist items (for exams: syllabus topics). */
  subtasks: Subtask[];
}

export type EventKind = "holiday" | "event";

export interface CalEvent extends Base {
  title: string;
  kind: EventKind;
  date: string;
  /** Last day (inclusive). Same as `date` for a single day. */
  endDate: string;
  note: string;
}
