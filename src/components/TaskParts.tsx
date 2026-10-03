"use client";

import { useState } from "react";
import {
  Check,
  CircleHelp,
  FileText,
  Flame,
  GraduationCap,
  ListChecks,
  Plus,
  Rocket,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { addTask, deleteTask, restoreTask, setTaskDone, updateTask, uid } from "@/lib/repo";
import {
  KINDS,
  KIND_BY_ID,
  PRIORITY_LABEL,
  dueLabel,
  bucketOf,
  subtaskProgress,
} from "@/lib/tasks";
import { addDays, toDateStr, weekdayOf } from "@/lib/dates";
import type { Priority, Subject, Subtask, Task, TaskKind } from "@/lib/types";
import { Button, cx, useToast } from "./ui";

export const KIND_ICON: Record<TaskKind, typeof FileText> = {
  assignment: FileText,
  exam: GraduationCap,
  quiz: CircleHelp,
  project: Rocket,
  personal: UserRound,
};

// ---------- one row in a list ----------

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
          task.done ? "border-safe bg-safe text-white" : "border-line bg-bg text-transparent",
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
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted">
            {task.done ? (
              <span className="font-medium text-safe">Completed</span>
            ) : (
              <>
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
              </>
            )}
            {origin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium">
                <origin.icon size={11} /> {origin.label}
              </span>
            )}
          </span>
        </span>
        {task.priority === "high" && !task.done && (
          <Flame size={16} className="shrink-0 text-danger" aria-label="High priority" />
        )}
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
}: {
  task?: Task;
  subjects: Subject[];
  defaultKind?: TaskKind;
  defaultDate?: string | null;
  onDone: () => void;
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
  const [newSub, setNewSub] = useState("");
  const [busy, setBusy] = useState(false);

  const isExam = kind === "exam" || kind === "quiz";
  const valid = title.trim().length > 0;

  function addSub() {
    const text = newSub.trim();
    if (!text) return;
    setSubtasks((s) => [...s, { id: uid(), text, done: false }]);
    setNewSub("");
  }

  async function save() {
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
    };
    if (task) {
      await updateTask(task.id, data);
      toast.show("Saved");
    } else {
      const t = await addTask(data);
      toast.show(`${KIND_BY_ID[kind].label} added`, () => {
        deleteTask(t.id);
      });
    }
    onDone();
  }

  async function remove() {
    if (!task) return;
    await deleteTask(task.id);
    toast.show("Deleted", () => restoreTask(task.id));
    onDone();
  }

  const inputBase =
    "h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-[16px] outline-none placeholder:text-muted/70 focus:border-accent";

  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Type">
        {KINDS.map((k) => {
          const Icon = KIND_ICON[k.id];
          const on = kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setKind(k.id)}
              className={cx(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition",
                on ? "bg-text text-bg" : "bg-surface-2",
              )}
            >
              <Icon size={15} />
              {k.label}
            </button>
          );
        })}
      </div>

      <input
        className={cx(inputBase, "mt-4")}
        placeholder={isExam ? "e.g. DBMS mid-sem" : "What needs to be done?"}
        value={title}
        maxLength={120}
        autoFocus={!task}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Title"
      />

      {subjects.length > 0 && (
        <>
          <p className="mt-5 mb-2 text-[13px] font-medium text-muted">Subject</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setSubjectId(null)}
              className={cx(
                "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium",
                subjectId === null ? "bg-text text-bg" : "bg-surface-2",
              )}
            >
              None
            </button>
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSubjectId(s.id)}
                className={cx(
                  "h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium",
                  subjectId === s.id ? "text-white" : "bg-surface-2",
                )}
                style={subjectId === s.id ? { background: s.color } : undefined}
              >
                {s.code || s.name}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="mt-5 mb-2 text-[13px] font-medium text-muted">{isExam ? "Date" : "Due"}</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {dateChips(today).map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setDueDate(c.date)}
            className={cx(
              "h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium",
              dueDate === c.date ? "bg-accent text-on-accent" : "bg-surface-2",
            )}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDueDate(null)}
          className={cx(
            "h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium",
            dueDate === null ? "bg-accent text-on-accent" : "bg-surface-2",
          )}
        >
          No date
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <input
          type="date"
          value={dueDate ?? ""}
          onChange={(e) => setDueDate(e.target.value || null)}
          aria-label="Date"
          className={cx(inputBase, "min-w-0")}
        />
        <input
          type="time"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
          aria-label="Time"
          className={cx(inputBase, "min-w-0")}
        />
      </div>
      {isExam && (
        <input
          className={cx(inputBase, "mt-3")}
          placeholder="Hall / room (optional)"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          aria-label="Room"
        />
      )}

      <p className="mt-5 mb-2 text-[13px] font-medium text-muted">Priority</p>
      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Priority">
        {(["low", "med", "high"] as Priority[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={priority === p}
            onClick={() => setPriority(p)}
            className={cx(
              "h-9 rounded-lg text-sm font-medium transition",
              priority === p ? "bg-surface shadow-sm" : "text-muted",
              priority === p && p === "high" && "text-danger",
            )}
          >
            {PRIORITY_LABEL[p]}
          </button>
        ))}
      </div>

      <p className="mt-5 mb-2 flex items-center gap-1.5 text-[13px] font-medium text-muted">
        <ListChecks size={15} /> {isExam ? "Syllabus topics" : "Checklist"}
      </p>
      <ul className="space-y-1.5">
        {subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2">
            <button
              type="button"
              aria-label={s.done ? "Mark not done" : "Mark done"}
              onClick={() =>
                setSubtasks((list) => list.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))
              }
              className={cx(
                "grid size-5 shrink-0 place-items-center rounded-md border-2",
                s.done ? "border-safe bg-safe text-white" : "border-line bg-bg text-transparent",
              )}
            >
              <Check size={12} strokeWidth={3.5} />
            </button>
            <span className={cx("min-w-0 flex-1 text-[15px] [overflow-wrap:anywhere]", s.done && "text-muted line-through")}>
              {s.text}
            </span>
            <button
              type="button"
              aria-label="Remove"
              onClick={() => setSubtasks((list) => list.filter((x) => x.id !== s.id))}
              className="text-muted"
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
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
        <button
          type="button"
          onClick={addSub}
          aria-label="Add item"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2"
        >
          <Plus size={18} />
        </button>
      </div>

      <textarea
        className="mt-4 min-h-20 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[16px] outline-none placeholder:text-muted/70 focus:border-accent"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-label="Notes"
      />

      <div className="mt-5 flex gap-3">
        {task && (
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        )}
        <Button className="flex-1" onClick={save} disabled={!valid || busy}>
          {task ? "Save changes" : `Add ${KIND_BY_ID[kind].label.toLowerCase()}`}
        </Button>
      </div>
    </div>
  );
}
