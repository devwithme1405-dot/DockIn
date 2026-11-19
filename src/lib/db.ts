import Dexie, { type Table } from "dexie";
import type { ChatMessage, ChatPerson, ChatRead, PollVote } from "./chat";
import type {
  ClassNote,
  CalEvent,
  Category,
  Due,
  Expense,
  Friend,
  Group,
  Income,
  MerchantRule,
  Profile,
  Reaction,
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
  /** Reactions on shared assignments: a mirror of the server, like shares. */
  reactions!: Table<Reaction & { id: string }, string>;
  /** Udhaar: who owes you, and whom you owe. */
  dues!: Table<Due, string>;
  /** Money in that was not a friend paying back. */
  incomes!: Table<Income, string>;
  /** Your own note on a class Camu left unmarked: cancelled, or teacher yet to mark. */
  classNotes!: Table<ClassNote, string>;
  messages!: Table<ChatMessage, string>;
  chatReads!: Table<ChatRead, string>;
  chatPeople!: Table<ChatPerson, string>;
  pollVotes!: Table<PollVote, string>;
  seenBy!: Table<{ id: string; thread: string; userId: string; readAt: number }, string>;
  /** Chat documents already downloaded once, so they reopen offline. */
  fileCache!: Table<{ path: string; blob: Blob; at: number }, string>;
  msgReactions!: Table<{ id: string; messageId: string; userId: string; emoji: string }, string>;
  blocks!: Table<{ id: string; name: string }, string>;

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
    this.version(7).stores({
      reactions: "id, shareId",
    });
    this.version(8).stores({
      dues: "id, person, dir",
      incomes: "id, date",
    });
    this.version(9).stores({
      classNotes: "id",
    });
    this.version(10).stores({
      messages: "id, thread, createdAt",
      chatReads: "thread",
      chatPeople: "id",
    });
    this.version(11).stores({
      pollVotes: "id, messageId",
      blocks: "id",
    });
    this.version(12).stores({
      msgReactions: "id, messageId",
    });
    this.version(13).stores({
      seenBy: "id, thread",
    });
    this.version(14).stores({
      fileCache: "path, at",
    });
  }
}

export const db = new DockinDB();

// A screen copy older than this phone's data (the APK's built-in copy, after
// the live site moved the database on) cannot open it. Hand back to the live
// site, which knows the newer layout, rather than show a broken app.
if (typeof window !== "undefined") {
  db.open().catch((e: unknown) => {
    if ((e as { name?: string })?.name !== "VersionError") return;
    try {
      const w = window as unknown as { Capacitor?: { Plugins?: { DockIn?: { setLive?: (o: { on: boolean }) => Promise<void> } } } };
      const once = sessionStorage.getItem("dockin-version-handoff");
      if (once) return;
      sessionStorage.setItem("dockin-version-handoff", "1");
      void w.Capacitor?.Plugins?.DockIn?.setLive?.({ on: true })?.finally(() => window.location.reload());
    } catch {
      /* nothing else to try */
    }
  });
}
