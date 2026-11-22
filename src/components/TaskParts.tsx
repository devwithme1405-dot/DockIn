"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  CircleHelp,
  FileText,
  Flag,
  Bell,
  Flame,
  GraduationCap,
  ListChecks,
  Pin,
  Plus,
  Rocket,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { addTask, copyTask, deleteTask, restoreTask, setTaskDone, updateTask, uid } from "@/lib/repo";
import {
  KINDS,
  KIND_BY_ID,
  PRIORITY_LABEL,
  dueLabel,
  bucketOf,
  subtaskProgress,
} from "@/lib/tasks";
import { addDays, toDateStr, weekdayOf } from "@/lib/dates";
import type { Priority, Subject, Subtask, Task, TaskKind, TaskReminder } from "@/lib/types";
import { db } from "@/lib/db";
import { Button, cx, useToast } from "./ui";
import { LmsHandIn } from "./SolutionStudio";
import { assignInstance } from "@/lib/solution";
import { ReminderEditor } from "./TaskReminders";
import { reminderSummary } from "@/lib/taskReminders";

export const KIND_ICON: Record<TaskKind, typeof FileText> = {
  assignment: FileText,
  exam: GraduationCap,
  quiz: CircleHelp,
  project: Rocket,
  personal: UserRound,
};

// ---------- one row in a list ----------

/** Common deadlines — LMS likes 11:59 PM; a custom time is one tap away. */
const TIME_CHIPS = ["09:00", "13:00", "17:00", "20:00", "23:59"];

function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function TaskRow({
  task,
  subject,
  today,
  origin,
  onOpen,
  onDone,
}: {
  task: Task;
  subject?: Subject;
  today: string;
  /** Where this came from — "Personal", a group, a friend. */
  origin?: { label: string; icon: typeof UserRound };
  onOpen: () => void;
  onDone?: (id: string) => void;
}) {
  const toast = useToast();
  const kind = KIND_BY_ID[task.kind];
  const Icon = KIND_ICON[task.kind];
  const prog = subtaskProgress(task);
  const overdue = !task.done && bucketOf(task, today) === "overdue";
  // Deleting is two steps on purpose: the first strikes the row out and says
  // what will happen, the second does it. A list where one tap destroys
  // something is a list people stop trusting, and an undo you have four seconds
  // to notice is not a real answer.
  const [removing, setRemoving] = useState(false);

  async function toggle() {
    const next = !task.done;
    await setTaskDone(task.id, next);
    if (next) onDone?.(task.id);
  }

  async function remove() {
    await deleteTask(task.id);
    setRemoving(false);
    toast.show("Deleted", () => restoreTask(task.id));
  }

  if (removing) {
    return (
      <li className="flex items-center gap-3 bg-danger-soft px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 text-[15px] font-medium text-muted line-through">
            {task.title}
          </span>
          <span className="text-[12.5px] text-muted">Delete this?</span>
        </span>
        <button
          onClick={() => setRemoving(false)}
          className="h-9 shrink-0 rounded-full px-3 text-[13.5px] font-medium"
        >
          Keep
        </button>
        <button
          onClick={remove}
          className="h-9 shrink-0 rounded-full bg-danger px-3.5 text-[13.5px] font-medium text-white"
        >
          Delete
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <button
        onClick={toggle}
        aria-label={task.done ? "Mark as not done" : "Mark as done"}
        aria-pressed={task.done}
        className={cx(
          "grid size-7 shrink-0 place-items-center rounded-full border-2 transition active:scale-90",
          task.done ? "anim-check border-safe bg-safe text-white" : "border-line bg-bg text-transparent",
        )}
      >
        <Check size={15} strokeWidth={3} />
      </button>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          className={cx(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            task.done ? "bg-surface-2 text-muted" : cx(kind.tint, kind.ink),
          )}
        >
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cx(
              "line-clamp-2 text-[15px] font-medium leading-snug [overflow-wrap:anywhere]",
              task.done && "text-muted line-through",
            )}
          >
            {task.title}
          </span>
          {!subject && task.source === "lms" && task.notes && (
            <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-mess">{task.notes}</span>
          )}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted">
            {task.done ? (
              <span className="font-medium text-safe">Completed</span>
            ) : (
              <>
                <span className="font-medium">{kind.label}</span>
                {subject && (
                  <span className="font-medium" style={{ color: subject.color }}>
                    {subject.code || subject.name}
                  </span>
                )}
                <span className={cx(overdue && "font-medium text-danger")}>
                  {dueLabel(task, today)}
                </span>
                {prog.total > 0 && (
                  <span className="tabular-nums">
                    {prog.done}/{prog.total}
                  </span>
                )}
                {reminderSummary(task, today) && (
                  <span className="inline-flex items-center gap-0.5 font-medium text-accent">
                    <Bell size={11} /> {reminderSummary(task, today)}
                  </span>
                )}
              </>
            )}
            {origin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium">
                <origin.icon size={11} /> {origin.label}
              </span>
            )}
            {!origin && task.source === "lms" && (
              <span className="inline-flex items-center rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">
                {/* An assignment can be handed in from the task itself (tap it). */}
                {!task.done && assignInstance(task.id) !== null ? "LMS · Hand in" : "LMS"}
              </span>
            )}
            {(task.sharedWith?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#d9772b]/12 px-1.5 py-0.5 text-[11px] font-medium text-[#b85d1c]">
                <Send size={10} /> Shared
              </span>
            )}
          </span>
        </span>
        {task.priority === "high" && !task.done && (
          <Flame size={16} className="shrink-0 text-danger" aria-label="High priority" />
        )}
      </button>
      <button
        onClick={() => void updateTask(task.id, { pinned: !task.pinned })}
        aria-label={task.pinned ? "Unpin" : "Pin to top"}
        aria-pressed={!!task.pinned}
        className={cx("grid size-8 shrink-0 place-items-center rounded-full", task.pinned ? "text-accent" : "text-muted")}
      >
        <Pin size={15} className={task.pinned ? "fill-current" : ""} />
      </button>
      <button
        onClick={() => setRemoving(true)}
        aria-label={`Delete ${task.title}`}
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted"
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}

// ---------- add / edit form ----------

function dateChips(today: string): { label: string; date: string }[] {
  const toMonday = ((8 - weekdayOf(today)) % 7) || 7;
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "In 3 days", date: addDays(today, 3) },
    { label: "Next Mon", date: addDays(today, toMonday) },
    { label: "In 2 weeks", date: addDays(today, 14) },
  ];
}

export function TaskForm({
  task,
  subjects,
  defaultKind = "assignment",
  defaultDate = null,
  onDone,
  onCreated,
  onShare,
  submitLabel,
}: {
  task?: Task;
  subjects: Subject[];
  defaultKind?: TaskKind;
  defaultDate?: string | null;
  onDone: () => void;
  /** A new task was saved (e.g. to offer sharing it). */
  onCreated?: (t: Task) => void;
  /** Overrides the main button's text for a new task. */
  submitLabel?: string;
  /**
   * Editing: send this task to friends ("send"), or — a task already shared
   * whose details just changed — offer to send the changes ("update").
   */
  onShare?: (t: Task, mode: "send" | "update") => void;
}) {
  const toast = useToast();
  const today = toDateStr();
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? defaultKind);
  const [title, setTitle] = useState(task?.title ?? "");
  const [subjectId, setSubjectId] = useState<string | null>(task?.subjectId ?? null);
  const [dueDate, setDueDate] = useState<string | null>(task ? task.dueDate : defaultDate);
  const [dueTime, setDueTime] = useState(task?.dueTime ?? "");
  const [room, setRoom] = useState(task?.room ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "med");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? []);
  const [reminders, setReminders] = useState<TaskReminder[]>(task?.reminders ?? []);
  const [newSub, setNewSub] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // For a new task, focus the title — but only once the sheet has slid up. Doing
  // it immediately pops the keyboard mid-animation, and the viewport resizing
  // under the opening sheet is what read as a flicker on tapping +.
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (task) return;
    const t = setTimeout(() => titleRef.current?.focus(), 260);
    return () => clearTimeout(t);
  }, [task]);

  const isExam = kind === "exam" || kind === "quiz";
  const valid = title.trim().length > 0;

  function addSub() {
    const text = newSub.trim();
    if (!text) return;
    setSubtasks((s) => [...s, { id: uid(), text, done: false }]);
    setNewSub("");
  }

  async function save(thenShare = false) {
    if (!valid || busy) return;
    setBusy(true);
    const data = {
      title: title.trim(),
      kind,
      subjectId,
      dueDate,
      dueTime: dueTime || null,
      room: isExam ? room : "",
      priority,
      notes,
      subtasks: newSub.trim()
        ? [...subtasks, { id: uid(), text: newSub.trim(), done: false }]
        : subtasks,
      reminders,
    };
    if (task) {
      // What friends see of it: a change here is worth sending them.
      const theySee = (x: Pick<Task, "title" | "kind" | "subjectId" | "dueDate" | "dueTime" | "notes" | "priority">) =>
        JSON.stringify([x.title.trim(), x.kind, x.subjectId ?? null, x.dueDate ?? null, x.dueTime || null, (x.notes ?? "").trim(), x.priority]);
      const changed = theySee(task) !== theySee(data);
      await updateTask(task.id, data);
      const fresh = (await db.tasks.get(task.id)) ?? { ...task, ...data };
      if (onShare && thenShare) {
        onDone();
        onShare(fresh, "send");
        return;
      }
      if (onShare && changed && (task.sharedWith?.length ?? 0) > 0) {
        onDone();
        onShare(fresh, "update");
        return;
      }
      toast.show("Saved");
    } else {
      const t = await addTask(data);
      toast.show(`${KIND_BY_ID[kind].label} added`, () => {
        deleteTask(t.id);
      });
      onCreated?.(t);
    }
    onDone();
  }

  async function remove() {
    if (!task) return;
    await deleteTask(task.id);
    toast.show("Deleted", () => restoreTask(task.id));
    onDone();
  }

  async function copyTo(date: string | null) {
    if (!task) return;
    const made = await copyTask(task.id, date);
    toast.show(`Copied${date ? "" : " with no date"}`, made ? () => void deleteTask(made.id) : undefined);
    onDone();
  }

  const inputBase = "field h-12 w-full px-3.5 text-[16px]";

  return (
    <div className="space-y-3">
      {task?.source === "lms" && <LmsHandIn task={task} />}

      {/* What: the title, big and on white, with its type right under it. */}
      <div className="field overflow-hidden focus-within:border-[#d9772b]">
        <input
          ref={titleRef}
          className="h-14 w-full bg-transparent px-4 text-[18px] font-bold outline-none placeholder:font-semibold placeholder:text-muted/70"
          placeholder={isExam ? "e.g. DBMS mid-sem" : "What needs to be done?"}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Title"
        />
        <div className="flex gap-1.5 overflow-x-auto border-t border-card-edge/50 px-2.5 py-2.5 [scrollbar-width:none]" role="radiogroup" aria-label="Type">
          {KINDS.map((k) => {
            const Icon = KIND_ICON[k.id];
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                className="chip inline-flex items-center gap-1.5"
              >
                <Icon size={14} />
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* When */}
      <section className="form-card">
        <p className="form-label">
          <CalendarDays size={14} /> {isExam ? "Date & time" : "Due"}
        </p>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {dateChips(today).map((c) => (
            <button key={c.label} type="button" aria-pressed={dueDate === c.date} onClick={() => setDueDate(c.date)} className="chip">
              {c.label}
            </button>
          ))}
          <button type="button" aria-pressed={dueDate === null} onClick={() => setDueDate(null)} className="chip">
            No date
          </button>
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <input
            type="date"
            value={dueDate ?? ""}
            onChange={(e) => setDueDate(e.target.value || null)}
            aria-label="Date"
            className={cx(inputBase, "min-w-0 text-[15px]")}
          />
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            aria-label="Time"
            className={cx(inputBase, "w-[8.4rem] text-[15px]")}
          />
        </div>
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {[null, ...TIME_CHIPS].map((t) => (
            <button
              key={t ?? "none"}
              type="button"
              aria-pressed={(dueTime || null) === t}
              onClick={() => setDueTime(t ?? "")}
              className="chip h-8 px-3 text-[12.5px]"
            >
              {t ? fmtClock(t) : "No time"}
            </button>
          ))}
        </div>
        {isExam && (
          <input
            className={cx(inputBase, "mt-2")}
            placeholder="Hall / room (optional)"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            aria-label="Room"
          />
        )}
      </section>

      <ReminderEditor value={reminders} onChange={setReminders} dueDate={dueDate} dueTime={dueTime} />

      {/* Subject + priority */}
      {subjects.length > 0 && (
        <section className="form-card">
          <p className="form-label">
            <BookOpen size={14} /> Subject
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            <button type="button" aria-pressed={subjectId === null} onClick={() => setSubjectId(null)} className="chip">
              None
            </button>
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={subjectId === s.id}
                onClick={() => setSubjectId(s.id)}
                className="chip inline-flex items-center gap-1.5"
              >
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.code || s.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="form-card">
        <p className="form-label">
          <Flag size={14} /> Priority
        </p>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Priority">
          {(["low", "med", "high"] as Priority[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={priority === p}
              onClick={() => setPriority(p)}
              className="chip inline-flex items-center justify-center gap-1.5"
            >
              <span className={cx("size-2 rounded-full", p === "high" ? "bg-danger" : p === "med" ? "bg-warn" : "bg-safe")} />
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </section>

      <section className="form-card">
        <p className="form-label">
          <ListChecks size={14} /> {isExam ? "Syllabus topics" : "Checklist"}
        </p>
        {subtasks.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {subtasks.map((s) => (
              <li key={s.id} className="field flex items-center gap-2.5 px-3 py-2">
                <button
                  type="button"
                  aria-label={s.done ? "Mark not done" : "Mark done"}
                  onClick={() => setSubtasks((list) => list.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                  className={cx(
                    "grid size-5 shrink-0 place-items-center rounded-md border-2",
                    s.done ? "border-safe bg-safe text-white" : "border-line bg-bg text-transparent",
                  )}
                >
                  <Check size={12} strokeWidth={3.5} />
                </button>
                <span className={cx("min-w-0 flex-1 text-[15px] [overflow-wrap:anywhere]", s.done && "text-muted line-through")}>{s.text}</span>
                <button type="button" aria-label="Remove" onClick={() => setSubtasks((list) => list.filter((x) => x.id !== s.id))} className="text-muted">
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            className={cx(inputBase, "h-11 flex-1")}
            placeholder={isExam ? "Add a topic, e.g. Normalization" : "Add a step"}
            value={newSub}
            maxLength={80}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSub();
              }
            }}
            aria-label="New checklist item"
          />
          <button type="button" onClick={addSub} aria-label="Add item" className="btn-paper grid size-11 shrink-0 place-items-center rounded-xl">
            <Plus size={18} />
          </button>
        </div>
      </section>

      <textarea
        className="field min-h-24 w-full px-4 py-3 text-[16px]"
        placeholder="Notes (optional) — links, page numbers, who to ask…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-label="Notes"
      />

      {task && onShare && !task.deletedAt && (
        <button type="button" onClick={() => void save(true)} disabled={!valid || busy} className="form-card flex w-full items-center gap-3 text-left active:scale-[0.99]">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#d9772b]/15 text-[#b85d1c]">
            <Send size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">{task.sharedWith?.length ? "Send changes to friends" : "Send to friends"}</span>
            <span className="block text-[12.5px] text-muted">
              {task.sharedWith?.length
                ? `Shared with ${task.sharedWith.length} ${task.sharedWith.length === 1 ? "chat" : "chats"} — their copy updates, or add more people`
                : "Pick friends or groups — it lands in their Tasks"}
            </span>
          </span>
        </button>
      )}

      {task && (
        <section className="form-card">
          <p className="form-label">
            <Plus size={14} /> Copy to another day
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {[
              { label: "Tomorrow", date: addDays(today, 1) },
              { label: "In 3 days", date: addDays(today, 3) },
              { label: dateChips(today)[3].label, date: dateChips(today)[3].date },
              { label: "In a week", date: addDays(today, 7) },
            ].map((c) => (
              <button key={c.label} type="button" onClick={() => void copyTo(c.date)} className="chip">
                {c.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {confirmDel ? (
        <div className="rounded-2xl border-[1.5px] border-dashed border-danger/40 bg-danger-soft p-3.5">
          <p className="text-[14px] font-bold text-danger">Delete this task?</p>
          <p className="mt-0.5 text-[12.5px] text-muted">This removes it for good (you get a few seconds to undo).</p>
          <div className="mt-3 flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDel(false)}>
              Keep it
            </Button>
            <Button variant="danger" className="flex-1" onClick={remove}>
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="sticky bottom-0 -mx-5 flex gap-3 bg-gradient-to-t from-bg via-bg/95 to-transparent px-5 pt-4 pb-1">
          {task && (
            <Button variant="danger" onClick={() => setConfirmDel(true)}>
              Delete
            </Button>
          )}
          <Button className="h-12 flex-1 text-[15.5px]" onClick={() => void save()} disabled={!valid || busy}>
            {task ? "Save changes" : (submitLabel ?? `Add ${KIND_BY_ID[kind].label.toLowerCase()}`)}
          </Button>
        </div>
      )}
    </div>
  );
}

