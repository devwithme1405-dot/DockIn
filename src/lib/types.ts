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
  /** Required attendance, in percent (most colleges ask for 75). */
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
  /**
   * Enrolment number. Only used to put your own name and roll on a copy of
   * someone else's assignment, so it is asked for the first time that happens
   * rather than during sign-up.
   */
  roll?: string;
  /** The shape of a college day; see lib/periods.ts. */
  grid?: { start: string; length: number; gap: number; count: number };
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
  /**
   * When a timetable is revised mid-semester the old one still has to explain
   * the attendance already recorded against it, so a slot can start and stop on
   * a date instead of being edited in place. Null on both means "always".
   */
  from?: string | null;
  until?: string | null;
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

/**
 * Where the money went. These are the user's own, not a fixed list: on a campus
 * "Monginis" and "Tuck Shop" are the real answers, and every campus has
 * different ones.
 */
export type ExpenseCategory = string;

export interface Category extends Base {
  label: string;
  emoji: string;
  /** Position in the picker, so the ones used most sit first. */
  order: number;
}

/**
 * "24/7 Kathi means Tuck Shop" — said once, remembered forever, so a detected
 * payment from a shop you have been to before needs no decision at all.
 */
export interface MerchantRule extends Base {
  /** id is the normalised payee name; see merchantKey in lib/payments.ts. */
  label: string;
  category: ExpenseCategory;
}

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

// ---------------------------------------------------------------------------
// Friends, groups and shared assignments.
//
// These three are a local mirror of what the server lets you see, so the
// screens still render on the train with no signal. They are refreshed rather
// than synced: the server is always right about who your friends are.
// ---------------------------------------------------------------------------

export interface Friend {
  /** Their user id. */
  id: string;
  name: string;
  avatar?: string;
  branch?: string;
  year?: number;
  section?: string;
  bio?: string;
  /** Null unless they chose to share it. Never a percentage. */
  attendanceState: AttendanceState | null;
  status: "pending" | "accepted";
  /** True when they asked you, so the button says Accept rather than Pending. */
  theyAsked: boolean;
  updatedAt: number;
}

export interface Group {
  id: string;
  name: string;
  emoji: string | null;
  /** Six characters; anyone with it can join. */
  code: string;
  owner: string;
  members: number;
  updatedAt: number;
}

/**
 * The file attached to a shared assignment.
 *
 * `authorName` and `authorRoll` are the exact strings the author confirmed are
 * theirs inside the document, so a reader's copy can have their own put in
 * instead. They are not a guess made by the app, and the author sees them
 * before the post goes out.
 */
export interface ShareFile {
  /** What the author called it. */
  name: string;
  /** Where it sits in the private bucket. */
  path: string;
  size: number;
  /** "docx" can be personalised; "pdf" can only be renamed. */
  type: "docx" | "pdf";
  authorName?: string;
  authorRoll?: string;
}

/** An assignment someone posted to a group or sent to you directly. */
export interface Share {
  id: string;
  author: string;
  authorName: string;
  authorAvatar?: string;
  groupId: string | null;
  groupName: string | null;
  title: string;
  notes: string;
  kind: TaskKind;
  subjectName: string | null;
  dueDate: string | null;
  dueTime: string | null;
  room: string;
  priority: Priority;
  file?: ShareFile | null;
  createdAt: number;
  updatedAt: number;
}

/** What you did with a shared item. Yours alone, and it syncs with your data. */
export interface ShareState extends Base {
  done: boolean;
  doneAt: number | null;
  hidden: boolean;
}

/** Your own row in the campus directory. */
export interface MyProfile {
  code: string;
  shareAttendance: boolean;
}
