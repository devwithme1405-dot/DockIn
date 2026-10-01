import Dexie, { type Table } from "dexie";
import type { CalEvent, Expense, Profile, Session, Slot, Subject, Task } from "./types";

/**
 * Local-first database (IndexedDB). In the hosted version this same data is
 * synced with Supabase; the app code only talks to `repo.ts`, not to the
 * database directly, so that swap stays small.
 */
export class DockinDB extends Dexie {
  profile!: Table<Profile, string>;
  subjects!: Table<Subject, string>;
  slots!: Table<Slot, string>;
  sessions!: Table<Session, string>;
  expenses!: Table<Expense, string>;
  tasks!: Table<Task, string>;
  events!: Table<CalEvent, string>;

  constructor() {
    super("dockin");
    this.version(1).stores({
      profile: "id",
      subjects: "id, updatedAt",
      slots: "id, subjectId, weekday",
      sessions: "id, date, subjectId, [subjectId+date]",
    });
    this.version(2).stores({
      expenses: "id, date, category",
    });
    this.version(3).stores({
      tasks: "id, dueDate, done, kind",
      events: "id, date, endDate",
    });
  }
}

export const db = new DockinDB();
