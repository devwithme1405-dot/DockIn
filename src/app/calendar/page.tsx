"use client";

import { useMemo, useState } from "react";
import { BackHeader } from "@/components/PageHeader";
import { CalendarSkeleton } from "@/components/Skeleton";
import { CalendarPlus, ChevronLeft, ChevronRight, Plane, Star } from "lucide-react";
import { useAllSessions, useEvents, useSlots, useSubjects, useTasks } from "@/lib/hooks";
import { buildDayMap, emptyDay, monthGrid, slotsOn } from "@/lib/calendar";
import { monthKey, monthLabel, shiftMonth } from "@/lib/money";
import { WEEKDAYS_SHORT, addDays, fmtDay, fmtDayLong, fmtTime, relativeDayLabel, toDateStr } from "@/lib/dates";
import { KIND_BY_ID, compareTasks, daysBetween } from "@/lib/tasks";
import type { CalEvent, SessionStatus, Task } from "@/lib/types";
import { Sheet, cx } from "@/components/ui";
import { TaskForm, TaskRow } from "@/components/TaskParts";
import { EventForm } from "@/components/EventForm";

const WEEK_HEAD = [1, 2, 3, 4, 5, 6, 0].map((i) => WEEKDAYS_SHORT[i][0]);

const STATUS_PILL: Record<SessionStatus, { label: string; cls: string }> = {
  present: { label: "Present", cls: "bg-safe-soft text-safe" },
  absent: { label: "Absent", cls: "bg-danger-soft text-danger" },
  cancelled: { label: "Cancelled", cls: "bg-surface-2 text-muted" },
  holiday: { label: "Holiday", cls: "bg-safe-soft text-safe" },
  unmarked: { label: "Not marked", cls: "bg-surface-2 text-muted" },
};

export default function CalendarPage() {
  const today = toDateStr();
  const tasks = useTasks();
  const events = useEvents();
  const sessions = useAllSessions();
  const slots = useSlots();
  const subjects = useSubjects();

  const [month, setMonth] = useState(monthKey(today));
  const [selected, setSelected] = useState(today);
  const [sheet, setSheet] = useState<"event" | "task" | null>(null);
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const grid = useMemo(() => monthGrid(month), [month]);
  const dayMap = useMemo(
    () => buildDayMap(tasks ?? [], events ?? [], sessions ?? [], grid[0], grid[41]),
    [tasks, events, sessions, grid],
  );
  const subjectById = useMemo(() => new Map((subjects ?? []).map((s) => [s.id, s])), [subjects]);

  // Next 14 days, for the "Coming up" list
  const upcoming = useMemo(() => {
    const end = addDays(today, 14);
    const items: { date: string; kind: "task" | "event"; task?: Task; event?: CalEvent }[] = [];
    for (const t of tasks ?? []) {
      if (!t.done && t.dueDate && t.dueDate >= today && t.dueDate <= end)
        items.push({ date: t.dueDate, kind: "task", task: t });
    }
    for (const e of events ?? []) {
      const d = e.date < today ? today : e.date;
      if (e.endDate >= today && d <= end) items.push({ date: d, kind: "event", event: e });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [tasks, events, today]);

  if (!tasks || !events || !sessions || !slots || !subjects)
    return (
      <>
        <BackHeader
        href="/attendance"
        backLabel="Attendance"
        title="Calendar"
        right={
          <button
            onClick={() => setSheet("event")}
            aria-label="Add holiday or event"
            className="grid size-10 place-items-center rounded-full text-muted"
          >
            <CalendarPlus size={20} />
          </button>
        }
      />
        <CalendarSkeleton />
      </>
    );

  const info = dayMap.get(selected) ?? emptyDay();
  const daySessions = sessions.filter((s) => s.date === selected && subjectById.has(s.subjectId)).sort((a, b) => a.start.localeCompare(b.start));
  const dayClasses =
    daySessions.length > 0
      ? daySessions.map((s) => ({ id: s.id, subjectId: s.subjectId, start: s.start, end: s.end, status: s.status as SessionStatus | null }))
      : info.holiday.length > 0 || selected < today
        ? []
        : slotsOn(slots, selected).map((s) => ({ id: s.id, subjectId: s.subjectId, start: s.start, end: s.end, status: null as SessionStatus | null }));
  const isHoliday = info.holiday.length > 0;

  function goMonth(delta: number) {
    const m = shiftMonth(month, delta);
    setMonth(m);
    setSelected(m === monthKey(today) ? today : `${m}-01`);
  }
  function goToday() {
    setMonth(monthKey(today));
    setSelected(today);
  }

  return (
    <>
      <BackHeader
        href="/attendance"
        backLabel="Attendance"
        title="Calendar"
        right={
          <button
            onClick={() => setSheet("event")}
            aria-label="Add holiday or event"
            className="grid size-10 place-items-center rounded-full text-muted"
          >
            <CalendarPlus size={20} />
          </button>
        }
      />

      <section className="mx-5 lift rounded-3xl bg-surface p-3" aria-label="Month">
        <div className="mb-2 flex items-center justify-between px-1">
          <button aria-label="Previous month" onClick={() => goMonth(-1)} className="grid size-9 place-items-center rounded-full bg-surface-2">
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <p className="text-[16px] font-semibold">{monthLabel(month)}</p>
            {(month !== monthKey(today) || selected !== today) && (
              <button onClick={goToday} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                Today
              </button>
            )}
          </div>
          <button aria-label="Next month" onClick={() => goMonth(1)} className="grid size-9 place-items-center rounded-full bg-surface-2">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted">
          {WEEK_HEAD.map((d, i) => (
            <span key={i} className="py-1">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {grid.map((d) => {
            const inMonth = monthKey(d) === month;
            const di = dayMap.get(d);
            const isToday = d === today;
            const isSel = d === selected;
            const hol = !!di && di.holiday.length > 0;
            return (
              <button
                key={d}
                onClick={() => {
                  setSelected(d);
                  if (!inMonth) setMonth(monthKey(d));
                }}
                aria-label={fmtDayLong(d)}
                aria-pressed={isSel}
                className="group flex h-[3.15rem] flex-col items-center justify-start pt-1"
              >
                <span
                  className={cx(
                    "grid size-8 place-items-center rounded-full text-[14px] tabular-nums transition",
                    isSel ? "bg-accent font-semibold text-on-accent" : isToday ? "font-semibold text-accent shadow-[inset_0_0_0_1.5px_var(--accent)]" : hol ? "bg-safe-soft text-safe" : "",
                    !inMonth && !isSel && "text-muted/45",
                  )}
                >
                  {Number(d.slice(8, 10))}
                </span>
                <span className="mt-0.5 flex h-1.5 items-center gap-[3px]">
                  {di && di.exams.length > 0 && <i className="size-1.5 rounded-full bg-rose" />}
                  {di && di.due.length > 0 && <i className="size-1.5 rounded-full bg-violet" />}
                  {di && di.events.length > 0 && <i className="size-1.5 rounded-full bg-warn" />}
                  {di && di.attendance !== "none" && d < today && (
                    <i
                      className={cx(
                        "h-1 w-2.5 rounded-full",
                        di.attendance === "all" ? "bg-safe" : di.attendance === "some" ? "bg-warn" : "bg-danger",
                      )}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 border-t border-line px-1 pt-2.5 text-[11px] text-muted">
          <Legend dot="bg-rose" label="Exam" />
          <Legend dot="bg-violet" label="Deadline" />
          <Legend dot="bg-warn" label="Event" />
          <Legend dot="bg-safe" label="Holiday / all present" wide />
        </ul>
      </section>

      <section className="mt-5 px-5" aria-label={`Details for ${fmtDayLong(selected)}`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold">
              {relativeDayLabel(selected, today) === fmtDay(selected) ? fmtDayLong(selected) : `${relativeDayLabel(selected, today)}, ${fmtDay(selected).split(", ")[1]}`}
            </h2>
            <p className="text-[13px] text-muted">
              {isHoliday ? info.holiday.map((h) => h.title).join(", ") : daysBetween(today, selected) === 0 ? "Today" : daysBetween(today, selected) > 0 ? `In ${daysBetween(today, selected)} days` : `${-daysBetween(today, selected)} days ago`}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setSheet("task")} className="h-9 rounded-full bg-violet-soft px-3.5 text-[13px] font-medium text-violet">
              + Task
            </button>
            <button onClick={() => setSheet("event")} className="h-9 rounded-full bg-warn-soft px-3.5 text-[13px] font-medium text-warn">
              + Event
            </button>
          </div>
        </div>

        {(info.holiday.length > 0 || info.events.length > 0) && (
          <ul className="mb-3 space-y-2">
            {[...info.holiday, ...info.events].map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setEditEvent(e)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left",
                    e.kind === "holiday" ? "bg-safe-soft" : "bg-warn-soft",
                  )}
                >
                  {e.kind === "holiday" ? <Plane size={18} className="shrink-0 text-safe" /> : <Star size={18} className="shrink-0 text-warn" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{e.title}</span>
                    <span className="text-[12.5px] text-muted">
                      {e.kind === "holiday" ? "Holiday" : "Event"}
                      {e.endDate !== e.date && ` · ${fmtDay(e.date)} to ${fmtDay(e.endDate)}`}
                      {e.note && ` · ${e.note}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {(info.exams.length > 0 || info.due.length > 0) && (
          <ul className="mb-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
            {[...info.exams, ...info.due].sort(compareTasks).map((t) => (
              <TaskRow key={t.id} task={t} today={today} subject={t.subjectId ? subjectById.get(t.subjectId) : undefined} onOpen={() => setEditTask(t)} />
            ))}
          </ul>
        )}

        {dayClasses.length > 0 ? (
          <>
            <h3 className="mb-1.5 text-[13px] font-semibold text-muted">Classes</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
              {dayClasses.map((c) => {
                const sub = subjectById.get(c.subjectId);
                const pill = c.status ? STATUS_PILL[c.status] : null;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3.5 py-3">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: sub?.color ?? "#888" }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{sub?.name ?? "Class"}</span>
                      <span className="text-[12.5px] text-muted">
                        {fmtTime(c.start)} to {fmtTime(c.end)}
                      </span>
                    </span>
                    {pill && (
                      <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium", pill.cls)}>{pill.label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          info.exams.length === 0 &&
          info.due.length === 0 &&
          info.events.length === 0 &&
          info.holiday.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              {selected < today ? "Nothing recorded for this day." : "Nothing planned. A free day."}
            </p>
          )
        )}
        {isHoliday && dayClasses.length === 0 && (
          <p className="text-center text-[13px] text-muted">Classes on this day don&apos;t count towards attendance.</p>
        )}
      </section>

      <section className="mt-7 px-5 pb-6" aria-label="Coming up">
        <h2 className="mb-3 text-[17px] font-semibold">Coming up</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            Nothing in the next two weeks.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
            {upcoming.map((u, i) => {
              const isTask = u.kind === "task" && u.task;
              const k = isTask ? KIND_BY_ID[u.task!.kind] : null;
              return (
                <li key={i}>
                  <button
                    onClick={() => {
                      setSelected(u.date);
                      setMonth(monthKey(u.date));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                  >
                    <span className="w-12 shrink-0 text-center leading-tight">
                      <span className="block text-[17px] font-semibold tabular-nums">{Number(u.date.slice(8, 10))}</span>
                      <span className="block text-[11px] uppercase text-muted">{fmtDay(u.date).split(",")[0]}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{isTask ? u.task!.title : u.event!.title}</span>
                      <span className="text-[12.5px] text-muted">
                        {isTask ? `${k!.label}${u.task!.dueTime ? ` · ${fmtTime(u.task!.dueTime)}` : ""}` : u.event!.kind === "holiday" ? "Holiday" : "Event"}
                      </span>
                    </span>
                    <span
                      className={cx(
                        "size-2.5 shrink-0 rounded-full",
                        isTask ? (u.task!.kind === "exam" ? "bg-rose" : "bg-violet") : u.event!.kind === "holiday" ? "bg-safe" : "bg-warn",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Sheet open={sheet === "event"} onClose={() => setSheet(null)} title="Holiday or event">
        <EventForm defaultDate={selected} onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={!!editEvent} onClose={() => setEditEvent(null)} title="Edit">
        {editEvent && <EventForm key={editEvent.id} event={editEvent} defaultDate={selected} onDone={() => setEditEvent(null)} />}
      </Sheet>
      <Sheet open={sheet === "task"} onClose={() => setSheet(null)} title="New task">
        <TaskForm subjects={subjects} defaultDate={selected} onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={!!editTask} onClose={() => setEditTask(null)} title={editTask ? KIND_BY_ID[editTask.kind].label : "Task"}>
        {editTask && <TaskForm key={editTask.id} task={editTask} subjects={subjects} onDone={() => setEditTask(null)} />}
      </Sheet>
    </>
  );
}

function Legend({ dot, label, wide }: { dot: string; label: string; wide?: boolean }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <i className={cx(wide ? "h-1 w-2.5 rounded-full" : "size-1.5 rounded-full", dot)} />
      {label}
    </li>
  );
}
