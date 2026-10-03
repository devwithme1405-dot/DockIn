import Dexie, { type Table } from "dexie";
import type {
  CalEvent,
  Category,
  Expense,
  Friend,
  Group,
  MerchantRule,
  Profile,
  Session,
  Share,
  ShareState,
  Slot,
  Subject,
  Task,
} from "./types";

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
  // Friends, groups and shares are a mirror of the server, kept so the screens
  // work offline; shareState is yours and syncs with the rest of your data.
  friends!: Table<Friend, string>;
  groups!: Table<Group, string>;
  shares!: Table<Share, string>;
  shareState!: Table<ShareState, string>;
  categories!: Table<Category, string>;
  /** Which category a payee's name means, learned the first time you say. */
  merchants!: Table<MerchantRule, string>;

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
    this.version(4).stores({
      friends: "id, status",
      groups: "id",
      shares: "id, groupId, dueDate",
      shareState: "id, done",
    });
    this.version(5).stores({
      categories: "id, order",
    });
    this.version(6).stores({
      merchants: "id, category",
    });
  }
}

export const db = new DockinDB();
