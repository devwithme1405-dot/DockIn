import { describe, expect, it } from "vitest";
import { cleanReminders, describeReminder, reminderSummary, reminderTimes } from "@/lib/taskReminders";
import { buildReminders } from "@/lib/reminders";
import type { Task, TaskReminder } from "@/lib/types";

const today = "2026-11-23"; // a Monday
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00`).getTime();
const now = at(today, "10:00");
const far = now + 21 * 86_400_000;

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "t1", title: "DBMS assignment", notes: "", kind: "assignment", subjectId: null,
    dueDate: "2026-11-27", dueTime: "23:59", room: "", priority: "med", done: false, doneAt: null,
    subtasks: [], createdAt: 0, updatedAt: 0, deletedAt: null, ...over,
  }) as Task;

describe("when your own reminders fire", () => {
  it("once on a day: tomorrow, and again in 3 days (same task)", () => {
    const rs: TaskReminder[] = [
      { id: "a", kind: "at", date: "2026-11-24", time: "18:00" },
      { id: "b", kind: "at", date: "2026-11-26", time: "09:00" },
    ];
    const times = rs.flatMap((r) => reminderTimes(task(), r, now, far));
    expect(times).toEqual([at("2026-11-24", "18:00"), at("2026-11-26", "09:00")]);
  });

  it("twice a day, every day, until the deadline — then stops", () => {
    const t = task({ dueDate: "2026-11-25", dueTime: "20:00" });
    const morning = reminderTimes(t, { id: "m", kind: "daily", time: "08:00" }, now, far);
    const night = reminderTimes(t, { id: "n", kind: "daily", time: "21:00" }, now, far);
    expect(morning).toEqual([at("2026-11-24", "08:00"), at("2026-11-25", "08:00")]); // today's 8 AM already passed
    expect(night).toEqual([at("2026-11-23", "21:00"), at("2026-11-24", "21:00")]); // not after 8 PM on the due day
  });

  it("only on the days picked", () => {
    const t = task({ dueDate: null, dueTime: null });
    const times = reminderTimes(t, { id: "d", kind: "daily", time: "19:00", days: [1, 3] }, now, now + 8 * 86_400_000);
    expect(times.map((x) => new Date(x).getDay())).toEqual([1, 3, 1]);
  });

  it("before the deadline", () => {
    expect(reminderTimes(task(), { id: "x", kind: "before", minutes: 1440 }, now, far)).toEqual([at("2026-11-26", "23:59")]);
    expect(reminderTimes(task({ dueDate: null }), { id: "x", kind: "before", minutes: 60 }, now, far)).toEqual([]);
  });

  it("nothing once the task is done", () => {
    expect(reminderTimes(task({ done: true }), { id: "d", kind: "daily", time: "21:00" }, now, far)).toEqual([]);
  });
});

describe("they reach the phone's reminder list", () => {
  it("with the task's name and how long is left", () => {
    const t = task({ reminders: [{ id: "a", kind: "at", date: "2026-11-24", time: "18:00" }] });
    const items = buildReminders({ sessions: [], subjects: [], tasks: [t], overall: null, target: 75, today, now });
    const mine = items.find((i) => i.at === at("2026-11-24", "18:00"));
    expect(mine?.title).toBe("⏰ DBMS assignment");
    expect(mine?.body).toMatch(/days left/);
  });

  it("a done task rings nothing", () => {
    const t = task({ done: true, reminders: [{ id: "d", kind: "daily", time: "21:00" }] });
    const items = buildReminders({ sessions: [], subjects: [], tasks: [t], overall: null, target: 75, today, now });
    expect(items.filter((i) => i.title.startsWith("⏰"))).toHaveLength(0);
  });
});

describe("words", () => {
  it("say it plainly", () => {
    expect(describeReminder({ id: "1", kind: "at", date: "2026-11-24", time: "18:00" }, today)).toBe("Tomorrow, 6 PM");
    expect(describeReminder({ id: "1", kind: "daily", time: "21:30" }, today)).toBe("Every day, 9:30 PM");
    expect(describeReminder({ id: "1", kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] }, today)).toBe("Weekdays, 8 AM");
    expect(describeReminder({ id: "1", kind: "before", minutes: 1440 }, today)).toBe("1 day before");
    expect(reminderSummary(task({ reminders: [{ id: "1", kind: "daily", time: "21:00" }] }), today)).toBe("Daily 9 PM");
  });

  it("a shared task's reminders are checked before they are kept", () => {
    expect(cleanReminders([{ kind: "daily", time: "21:00" }, { kind: "at", date: "nope", time: "9" }, { kind: "evil", x: 1 }, null])).toHaveLength(1);
    expect(cleanReminders("junk")).toEqual([]);
  });
});
