"use client";

import { useState } from "react";
import { Bell, BellPlus, Plus, Repeat, X } from "lucide-react";
import { addDays, toDateStr } from "@/lib/dates";
import { uid } from "@/lib/repo";
import { isNativeApp } from "@/lib/native";
import { describeReminder, sameReminder } from "@/lib/taskReminders";
import type { TaskReminder } from "@/lib/types";
import { cx } from "./ui";

type Mode = "once" | "daily" | "days";
/** A reminder before it has an id. */
type Draft = TaskReminder extends infer R ? (R extends unknown ? Omit<R, "id"> : never) : never;
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * "Remind me…" on a task: as many reminders as you like — once on a day, every
 * day, or on chosen days, at any time; or a set time before the deadline. Two
 * times a day is two daily reminders; tomorrow and in three days is two "once"s.
 */
export function ReminderEditor({
  value,
  onChange,
  dueDate,
  dueTime,
}: {
  value: TaskReminder[];
  onChange: (next: TaskReminder[]) => void;
  dueDate: string | null;
  dueTime: string;
}) {
  const today = toDateStr();
  const hour = new Date().getHours();
  const [custom, setCustom] = useState(false);
  const [mode, setMode] = useState<Mode>("once");
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const add = (r: Draft) => {
    const next = { ...r, id: uid() } as TaskReminder;
    if (value.some((x) => sameReminder(x, next))) return;
    onChange([...value, next].slice(0, 12));
  };

  // One-tap ideas that fit this task right now.
  const quick: { label: string; r: Draft }[] = [
    ...(hour < 21 ? [{ label: "Tonight 9 PM", r: { kind: "at", date: today, time: "21:00" } as const }] : []),
    { label: "Tomorrow 8 AM", r: { kind: "at", date: addDays(today, 1), time: "08:00" } as const },
    { label: "Every day 9 PM", r: { kind: "daily", time: "21:00" } as const },
    ...(dueDate
      ? [
          { label: "1 day before", r: { kind: "before", minutes: 1440 } as const },
          { label: dueTime ? "1 hour before" : "3 days before", r: (dueTime ? { kind: "before", minutes: 60 } : { kind: "before", minutes: 3 * 1440 }) as Draft },
        ]
      : [{ label: "In 3 days", r: { kind: "at", date: addDays(today, 3), time: "09:00" } as const }]),
  ];

  function addCustom() {
    if (mode === "once") add({ kind: "at", date, time });
    else if (mode === "daily") add({ kind: "daily", time });
    else if (days.length) add({ kind: "daily", time, days: [...days].sort((a, b) => a - b) });
    setCustom(false);
  }

  const sorted = [...value].sort((a, b) => rank(a) - rank(b));

  return (
    <section className="form-card">
      <p className="form-label">
        <Bell size={14} /> Remind me
      </p>

      {sorted.length > 0 && (
        <ul className="mb-2 space-y-1.5" aria-label="Reminders">
          {sorted.map((r) => (
            <li key={r.id} className="field flex items-center gap-2.5 px-3 py-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                {r.kind === "daily" ? <Repeat size={14} /> : <Bell size={14} />}
              </span>
              <span className="min-w-0 flex-1 text-[14.5px] font-semibold">{describeReminder(r, today)}</span>
              <button
                type="button"
                aria-label={`Remove reminder ${describeReminder(r, today)}`}
                onClick={() => onChange(value.filter((x) => x.id !== r.id))}
                className="grid size-7 place-items-center text-muted"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {quick.map((q) => {
          const on = value.some((x) => sameReminder(x, { ...q.r, id: "" } as TaskReminder));
          return (
            <button
              key={q.label}
              type="button"
              aria-pressed={on}
              onClick={() => (on ? onChange(value.filter((x) => !sameReminder(x, { ...q.r, id: "" } as TaskReminder))) : add(q.r))}
              className="chip h-9 shrink-0 px-3 text-[12.5px]"
            >
              {q.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={custom}
          onClick={() => setCustom((c) => !c)}
          className="chip inline-flex h-9 shrink-0 items-center gap-1 px-3 text-[12.5px]"
        >
          <BellPlus size={13} /> Custom
        </button>
      </div>

      {custom && (
        <div className="mt-2 rounded-2xl border border-card-edge bg-surface p-3 [animation:rise-quick_220ms_ease-out_both]">
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Repeat">
            {(
              [
                ["once", "Once"],
                ["daily", "Every day"],
                ["days", "Pick days"],
              ] as const
            ).map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className="chip h-9 justify-center text-[12.5px]">
                {label}
              </button>
            ))}
          </div>

          {mode === "days" && (
            <div className="mt-2.5 flex justify-between gap-1" role="group" aria-label="Days">
              {DAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={days.includes(i)}
                  aria-label={DAY_NAMES[i]}
                  onClick={() => setDays((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]))}
                  className={cx(
                    "grid size-9 place-items-center rounded-full border text-[13px] font-bold",
                    days.includes(i) ? "border-transparent bg-accent text-white" : "border-card-edge text-muted",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          <div className={cx("mt-2.5 grid gap-2", mode === "once" ? "grid-cols-[1fr_auto]" : "grid-cols-1")}>
            {mode === "once" && (
              <input
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value || date)}
                aria-label="Reminder date"
                className="field h-11 min-w-0 px-3 text-[15px]"
              />
            )}
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value || time)}
              aria-label="Reminder time"
              className="field h-11 px-3 text-[15px]"
            />
          </div>
          <button
            type="button"
            onClick={addCustom}
            disabled={mode === "days" && days.length === 0}
            className="btn-paper mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold disabled:opacity-50"
          >
            <Plus size={16} /> Add reminder
          </button>
        </div>
      )}

      <p className="mt-2 text-[11.5px] leading-snug text-muted">
        {isNativeApp()
          ? "Add as many as you like — two times a day, or on different days. They stop once it's done."
          : "Reminders ring in the DockIn Android app. Add as many as you like."}
      </p>
    </section>
  );
}

/** Daily ones first, then by when. */
function rank(r: TaskReminder): number {
  if (r.kind === "daily") return Number(r.time.replace(":", ""));
  if (r.kind === "before") return 10_000 + r.minutes;
  return 1_000_000 + Number(r.date.replaceAll("-", "")) * 10 + Number(r.time.replace(":", "")) / 10_000;
}
