"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  GraduationCap,
  Layers,
  Minus,
  PartyPopper,
  SquareCheckBig,
  TriangleAlert,
  X,
} from "lucide-react";
import { StickyBar } from "@/components/PageHeader";
import { TodaySkeleton } from "@/components/Skeleton";
import { ensureSessionsSince, getProfile, setSessionStatus, setTaskDone } from "@/lib/repo";
import { useEvents, useSessionsOn, useSlots, useTasks } from "@/lib/hooks";
import { holidayLastDay, holidayOn, useAttendanceData, type ViewSession } from "@/lib/college";
import { CamuStatus } from "@/components/College";
import { eventsOn, holidayLength } from "@/lib/calendar";
import { bucketOf, compareTasks, countdownText, daysBetween, doneToday, dueLabel } from "@/lib/tasks";
import { addDays, fmtDay, fmtTime, greetingFor, nowHM, toDateStr, toMinutes } from "@/lib/dates";
import { describe, fmtPct, weekChange } from "@/lib/attendance";
import { loadReadKeys, saveReadKeys } from "@/lib/bell";
import type { AttendanceSummary, Session, SessionStatus, Subject, Task } from "@/lib/types";
import { Avatar, Sheet, cx, useCountUp, useToast } from "@/components/ui";
import { BookTile, Cap3D, InkBar, Notebook, PaperCheck, PaperIconButton, SectionTitle, TrendPill } from "@/components/Paper";

function useNow(): { today: string; hm: string } {
  const [now, setNow] = useState(() => ({ today: toDateStr(), hm: nowHM() }));
  useEffect(() => {
    const id = setInterval(() => setNow({ today: toDateStr(), hm: nowHM() }), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** "9:00 am" → "9:00 AM", the way it is written on a timetable. */
const clock = (t: string) => fmtTime(t).toUpperCase();

export default function TodayPage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const { today, hm } = useNow();
  const [bell, setBell] = useState(false);
  const target = profile?.target ?? 75;

  const { data, camu } = useAttendanceData(target);
  const slots = useSlots();
  const tasks = useTasks();
  const events = useEvents();
  const localToday = useSessionsOn(today);
  const todaySessions: ViewSession[] | undefined = camu ? data?.sessions.filter((s) => s.date === today) : localToday;

  // Keep the record of past days complete, so missed days can be caught up on.
  const joined = profile ? toDateStr(new Date(profile.createdAt)) : null;
  useEffect(() => {
    if (!joined) return;
    const earliest = addDays(today, -30);
    ensureSessionsSince(joined > earliest ? joined : earliest, today);
  }, [joined, today, slots]);

  const subjectById = useMemo(() => new Map(data?.subjects.map((s) => [s.id, s]) ?? []), [data]);

  const dayOff = useMemo(() => {
    const h = camu ? holidayOn(camu, today) : null;
    if (h) return [{ id: `camu-${h.start}`, title: h.title, kind: "holiday" as const, date: h.start, endDate: holidayLastDay(h), note: "", createdAt: 0, updatedAt: 0 }];
    return eventsOn(events ?? [], today).holidays;
  }, [events, today, camu]);

  const work = useMemo(() => {
    const all = tasks ?? [];
    const pending = all.filter((t) => !t.done).sort(compareTasks);
    // The list keeps anything ticked off today, struck through where it sat, so
    // a tap does not make the task disappear from under you — it stays as proof.
    const soon = all
      .filter((t) => {
        if (doneToday(t, today)) return true;
        if (t.done) return false;
        const b = bucketOf(t, today);
        return b === "overdue" || b === "today" || b === "tomorrow";
      })
      .sort(compareTasks);
    const dueToday = pending.filter((t) => bucketOf(t, today) === "today").length;
    const overdue = pending.filter((t) => bucketOf(t, today) === "overdue").length;
    const totalDue = pending.filter((t) => t.dueDate).length;
    const exam = pending.filter((t) => t.kind === "exam" && t.dueDate && t.dueDate >= today)[0];
    return { soon, dueToday, overdue, totalDue, exam };
  }, [tasks, today]);

  const attention = useMemo(
    () =>
      (data?.stats ?? [])
        .filter((s) => s.summary.state === "danger" || s.summary.state === "warn")
        .sort((a, b) => (a.summary.pct ?? 0) - (b.summary.pct ?? 0)),
    [data],
  );

  const unmarkedPast = useMemo(() => {
    if (!data || camu) return { count: 0, latest: null as string | null };
    const live = new Set(data.subjects.map((s) => s.id));
    const list = data.sessions.filter((s) => s.date < today && s.status === "unmarked" && live.has(s.subjectId));
    const latest = list.reduce<string | null>((m, s) => (m === null || s.date > m ? s.date : m), null);
    return { count: list.length, latest };
  }, [data, camu, today]);

  // The bell's notifications and which of them have been marked read. The read
  // marks live on the phone (see lib/bell), so closing the sheet or the whole
  // app keeps them; a mark is pruned only once its alert has cleared.
  const bellRows = useMemo(
    () => buildBellRows({ attention, overdue: work.overdue, exam: work.exam, today, unmarked: unmarkedPast }),
    [attention, work.overdue, work.exam, today, unmarkedPast],
  );
  const [readKeys, setReadKeys] = useState<Set<string>>(() => loadReadKeys());
  const markRead = (keys: string[]) => {
    // Keep only marks whose alert is still showing, then add the new ones, so
    // the stored set never grows without bound. A content-aware key that is no
    // longer present can never match a row anyway, so dropping it is safe.
    const present = new Set(bellRows.map((r) => r.key));
    const next = new Set([...readKeys].filter((k) => present.has(k)));
    for (const k of keys) next.add(k);
    setReadKeys(next);
    saveReadKeys(next);
  };

  const trend = useMemo(() => (data ? weekChange(data.sessions, data.overall, today) : null), [data, today]);

  // Today's classes, for the "Today's Classes" card and the schedule.
  const classes = useMemo(
    () =>
      (todaySessions ?? [])
        .filter((s) => s.status !== "cancelled" && s.status !== "holiday")
        .sort((a, b) => a.start.localeCompare(b.start)),
    [todaySessions],
  );

  if (!profile || !data) return <TodaySkeleton />;

  const name = profile.name || "there";
  const urgent = bellRows.some((r) => !readKeys.has(r.key));
  const greeting = greetingFor().replace(/\b\w/g, (c) => c.toUpperCase());
  const range = classes.length ? `${clock(classes[0].start)} – ${clock(classes[classes.length - 1].end)}` : "No classes";

  return (
    <div className="page-wash stagger">
      <StickyBar className="px-5 pb-2">
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Cap3D size={42} className="-ml-1" />
            <p className="font-display text-[24px] font-extrabold tracking-[-0.035em]">DockIn</p>
          </div>
          <div className="flex items-center gap-2.5">
            <PaperIconButton label="Updates" onClick={() => setBell(true)} dot={urgent}>
              <Bell size={19} strokeWidth={2.3} />
            </PaperIconButton>
            <Link
              href="/settings"
              aria-label="Profile and settings"
              className="rounded-full bg-card p-[2.5px] shadow-[0_0_0_1.5px_var(--card-edge),0_3px_0_var(--pbtn-lip)] transition active:translate-y-[2px]"
            >
              <Avatar name={name} avatar={profile.avatar} size={38} />
            </Link>
          </div>
        </div>
      </StickyBar>

      <div className="flex items-end justify-between gap-3 px-5 pt-3">
        <div className="min-w-0">
          <p className="text-[15.5px] font-semibold text-muted">{greeting},</p>
          <h1 className="font-display truncate text-[31px] leading-[1.1] font-extrabold tracking-[-0.035em]">
            {name.split(" ")[0]} <span aria-hidden>👋</span>
          </h1>
        </div>
        <span className="btn-paper mb-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] tnum">
          <CalendarDays size={15} className="text-accent" strokeWidth={2.4} />
          {fmtDay(today)}
        </span>
      </div>

      <AttendanceCard overall={data.overall} trend={trend} target={target} />
      {camu && <CamuStatus camu={camu} className="mt-3.5" />}

      {/* Two by two: the day's facts, each a tap into its screen. */}
      <div className="mt-6 grid grid-cols-2 gap-3 px-5">
        <StatCard
          href="/timetable"
          tint="bg-accent-soft"
          icon={<CalendarCheck size={20} className="text-accent" strokeWidth={2.3} />}
          label="Today's Classes"
          value={`${classes.length} ${classes.length === 1 ? "Class" : "Classes"}`}
          foot={
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted tnum">
              <Clock size={12} /> {range}
            </span>
          }
        />
        <StatCard
          href="/tasks"
          icon={<Layers size={20} className="text-accent" strokeWidth={2.3} />}
          label="Next Exam"
          value={work.exam ? work.exam.title : "None"}
          valueSmall
          foot={
            work.exam?.dueDate ? (
              <span className="text-[12px] font-semibold text-muted tnum">
                {fmtDay(work.exam.dueDate)}{" "}
                <span className="font-extrabold text-accent">({countdownText(daysBetween(today, work.exam.dueDate))})</span>
              </span>
            ) : (
              <span className="text-[12px] font-semibold text-muted">Nothing scheduled</span>
            )
          }
        />
      </div>

      {/* The day, as a timeline. */}
      <section className="mt-8" aria-label="Today's schedule">
        <SectionTitle href="/timetable" link="View Timetable">
          Today&apos;s Schedule
        </SectionTitle>

        {dayOff.length > 0 && (
          <div className="mx-5 mb-3 flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-violet/40 bg-violet-soft px-4 py-3">
            <PartyPopper size={19} className="shrink-0 text-violet" />
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-bold text-violet">{dayOff[0].title}</p>
              <p className="text-[12.5px] text-muted">
                Holiday{holidayLength(dayOff[0]) > 1 ? ` · ${holidayLength(dayOff[0])} days` : ""} · nothing counts against you
              </p>
            </div>
          </div>
        )}

        {todaySessions === undefined ? null : classes.length === 0 ? (
          <Notebook rings={false} className="mx-5 px-5 py-6 text-center">
            <p className="font-bold">{camu || (slots?.length ?? 0) > 0 ? "No classes today" : "No timetable yet"}</p>
            <p className="mt-1 text-[13.5px] text-muted">
              {camu
                ? dayOff.length
                  ? "It is a holiday."
                  : "Nothing on Camu's timetable."
                : (slots?.length ?? 0) > 0
                  ? "Enjoy the free time."
                  : "Add your subjects and weekly classes to see them here."}
            </p>
            {!camu && (slots?.length ?? 0) === 0 && (
              <Link href="/attendance/timetable" className="btn-leather mt-4 inline-flex h-11 items-center rounded-2xl px-5 text-[14px]">
                Set up timetable
              </Link>
            )}
          </Notebook>
        ) : (
          <div className="mx-5">
            <ol className="relative ml-1.5 border-l-2 border-dashed border-card-edge pl-5">
              {classes.map((s) => (
                <ScheduleRow
                  key={s.id}
                  session={s}
                  subject={subjectById.get(s.subjectId)}
                  camu={!!camu}
                  live={toMinutes(s.start) <= toMinutes(hm) && toMinutes(hm) < toMinutes(s.end)}
                  past={toMinutes(s.end) <= toMinutes(hm)}
                />
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* Tasks and the quick ways in, side by side like the desk. */}
      <section className="mt-8 grid grid-cols-2 gap-3 px-5" aria-label="Tasks and actions">
        <div>
          <h2 className="font-display mb-2.5 text-[16px] font-extrabold tracking-[-0.02em]">
            Today&apos;s Tasks {work.soon.length > 0 && <span className="text-muted">({work.soon.length})</span>}
          </h2>
          <Notebook rings={false} className="overflow-hidden">
            {work.soon.length === 0 ? (
              <div className="px-3.5 py-5 text-center">
                <p className="text-[13.5px] font-bold">Nothing due</p>
                <Link href="/tasks?new=1" className="btn-leather mt-3 inline-flex h-9 items-center rounded-xl px-3.5 text-[12.5px]">
                  Add a task
                </Link>
              </div>
            ) : (
              <ul>
                {work.soon.slice(0, 3).map((t) => (
                  <TaskLine key={t.id} task={t} today={today} />
                ))}
              </ul>
            )}
          </Notebook>
        </div>

        <div>
          <h2 className="font-display mb-2.5 text-[16px] font-extrabold tracking-[-0.02em]">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <QuickAction href="/tasks?new=1" icon={<SquareCheckBig size={18} strokeWidth={2.5} />} label="Add Task" />
            <QuickAction href="/timetable" icon={<CalendarDays size={18} strokeWidth={2.5} />} label="Timetable" />
          </div>
        </div>
      </section>

      <Sheet open={bell} onClose={() => setBell(false)} title="Updates">
        <Updates
          rows={bellRows}
          read={readKeys}
          onMarkRead={markRead}
          onClose={() => setBell(false)}
        />
      </Sheet>
    </div>
  );
}

// ---------- the attendance card ----------

function AttendanceCard({ overall, trend, target }: { overall: AttendanceSummary; trend: number | null; target: number }) {
  const shown = useCountUp(overall.pct ?? 0, 900);
  const tone = overall.state === "danger" ? "text-danger" : overall.state === "warn" ? "text-warn" : "text-muted";
  return (
    <Link href="/attendance" className="mx-5 mt-7 block transition active:scale-[0.99]" aria-label="Attendance">
      <Notebook className="px-4 pb-4">
        <div className="flex items-center gap-3.5">
          <span className="grid size-[78px] shrink-0 place-items-center rounded-[22px] bg-accent-soft shadow-[inset_0_1px_3px_rgb(var(--shadow-ink)/0.16)]">
            <Cap3D size={68} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-muted">Attendance</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <p className="font-display text-[44px] leading-none font-extrabold tracking-[-0.045em] tnum">
                {overall.pct === null ? "--" : `${Math.round(shown)}%`}
              </p>
              {trend !== null && trend !== 0 && <TrendPill delta={trend} />}
            </div>
          </div>
          <ChevronRight size={22} className="shrink-0 text-muted" />
        </div>
        <InkBar pct={overall.pct} target={target} state={overall.state} className="mt-4" />
        <p className={cx("mt-2.5 text-[13px] font-semibold", tone)}>
          {overall.state === "none" ? "Mark a few classes to begin" : `Target ${target}% · ${describe(overall)}`}
        </p>
      </Notebook>
    </Link>
  );
}

// ---------- the 2x2 cards ----------

function StatCard({
  href,
  icon,
  label,
  value,
  foot,
  tint,
  valueSmall,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  foot: React.ReactNode;
  tint?: string;
  valueSmall?: boolean;
}) {
  return (
    <Link href={href} className={cx("lift block rounded-3xl p-3.5 transition active:scale-[0.98]", tint)} aria-label={label}>
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-2xl bg-card/80 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_1px_2px_rgb(var(--shadow-ink)/0.14)]">
          {icon}
        </span>
      </div>
      <p className="mt-2.5 text-[12.5px] font-bold text-muted">{label}</p>
      <p
        className={cx(
          "font-display mt-0.5 truncate font-extrabold tracking-[-0.03em] tnum",
          valueSmall ? "text-[17px] leading-tight" : "text-[24px] leading-none",
        )}
      >
        {value}
      </p>
      <div className="mt-1.5">{foot}</div>
    </Link>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="lift flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-accent-soft py-3.5 text-center transition active:scale-[0.97]"
    >
      <span className="grid size-9 place-items-center rounded-full bg-card text-accent shadow-[0_1px_2px_rgb(var(--shadow-ink)/0.18)]">
        {icon}
      </span>
      <span className="text-[12px] font-bold">{label}</span>
    </Link>
  );
}

// ---------- schedule timeline ----------

function ScheduleRow({
  session,
  subject,
  camu,
  live,
  past,
}: {
  session: ViewSession;
  subject: Subject | undefined;
  camu: boolean;
  live: boolean;
  past: boolean;
}) {
  const name = subject?.name ?? "Class";
  return (
    <li className="relative mb-3 last:mb-0">
      {/* the dot on the line */}
      <span
        className={cx(
          "absolute top-6 -left-[26px] size-3 rounded-full border-2 border-card",
          live ? "bg-orange shadow-[0_0_0_3px_rgb(242_135_31/0.3)]" : past ? "bg-accent" : "bg-card-edge",
        )}
        aria-hidden
      />
      <div className={cx("lift flex items-center gap-3 rounded-2xl p-2.5", live && "bg-accent-soft")}>
        <BookTile size={44} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[14.5px] leading-snug font-bold [overflow-wrap:anywhere]">
            {name}
            {session.kind === "practical" && (
              <span className="ml-1.5 inline-block rounded-md bg-accent-soft px-1.5 py-0.5 align-middle text-[9.5px] font-extrabold tracking-[0.08em] text-accent">
                LAB
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[12.5px] font-semibold text-muted tnum">
            {clock(session.start)} – {clock(session.end)}
            {live && <span className="ml-1.5 font-extrabold text-accent">· Now</span>}
          </p>
          {!camu && <MarkRow session={session} name={subject?.code || name} />}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {session.room && (
            <span className="rounded-full border-[1.5px] border-card-edge bg-card px-2.5 py-1 text-[11.5px] font-bold text-muted tnum">
              {session.room}
            </span>
          )}
          {camu &&
            (session.status === "present" ? (
              <span className="stamp text-safe">Present</span>
            ) : session.status === "absent" ? (
              <span className="stamp text-danger">Absent</span>
            ) : past ? (
              <span className="text-[10.5px] font-semibold text-muted">Not marked</span>
            ) : null)}
        </div>
      </div>
    </li>
  );
}

const ACTIONS: { status: SessionStatus; label: string; icon: typeof Check; on: string }[] = [
  { status: "present", label: "Present", icon: Check, on: "bg-safe text-white border-safe" },
  { status: "absent", label: "Absent", icon: X, on: "bg-danger text-white border-danger" },
  { status: "cancelled", label: "Cancelled", icon: Minus, on: "bg-text text-bg border-text" },
];

function MarkRow({ session, name }: { session: Session; name: string }) {
  const toast = useToast();
  async function mark(next: SessionStatus) {
    const prev = session.status;
    const status = prev === next ? "unmarked" : next;
    await setSessionStatus(session.id, status);
    toast.show(
      status === "unmarked" ? "Cleared" : `${name}: ${status === "cancelled" ? "class cancelled" : `marked ${status}`}`,
      () => setSessionStatus(session.id, prev),
    );
  }
  return (
    <div className="mt-2 flex gap-1.5" role="group" aria-label={`Mark ${name}`}>
      {ACTIONS.map(({ status, label, icon: Icon, on }) => {
        const selected = session.status === status;
        return (
          <button
            key={status}
            onClick={(e) => {
              e.preventDefault();
              void mark(status);
            }}
            aria-pressed={selected}
            aria-label={label}
            className={cx(
              "grid size-8 place-items-center rounded-lg border-[1.5px] shadow-[0_1.5px_0_var(--pbtn-lip)] transition active:translate-y-[1.5px] active:shadow-none",
              selected ? on : "border-card-edge bg-card text-muted",
            )}
          >
            <Icon size={15} strokeWidth={2.75} />
          </button>
        );
      })}
    </div>
  );
}

// ---------- tasks ----------

function TaskLine({ task, today }: { task: Task; today: string }) {
  const toast = useToast();
  const [ticked, setTicked] = useState(false);
  const done = task.done || ticked;
  const bucket = bucketOf(task, today);
  const due = task.done
    ? { text: "Done", tone: "text-safe" }
    : bucket === "overdue"
      ? { text: "Overdue", tone: "text-danger" }
      : bucket === "today"
        ? { text: "Due Today", tone: "text-orange" }
        : bucket === "tomorrow"
          ? { text: "Due Tomorrow", tone: "text-accent" }
          : { text: dueLabel(task, today), tone: "text-muted" };

  function tick() {
    // Tapping a done one brings it back; tapping an open one marks it done after
    // a beat, so the strike-through is seen before it settles.
    if (task.done) {
      void setTaskDone(task.id, false);
      return;
    }
    if (ticked) return;
    setTicked(true);
    setTimeout(() => {
      void setTaskDone(task.id, true);
      toast.show(`Done: ${task.title}`, () => void setTaskDone(task.id, false));
    }, 450);
  }

  return (
    <li className="ruled-row">
      <Link href="/tasks" className="flex items-center gap-2.5 py-3 pr-3 pl-3">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            tick();
          }}
          aria-label={`Mark "${task.title}" done`}
          className="shrink-0"
        >
          <PaperCheck checked={done} />
        </button>
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate text-[14px] font-bold", done && "text-muted line-through")}>{task.title}</span>
          <span className={cx("block text-[12px] font-semibold", due.tone)}>{due.text}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>
    </li>
  );
}

// ---------- the bell ----------

type BellRow = { key: string; icon: typeof Bell; tone: string; title: string; body: string; href: string };

/**
 * Everything the bell would ring about, worked out from the same data the page
 * already has. Each key folds in the alert's current state — the rounded
 * percentage, the count, the date — so a mark-read sticks while nothing changes
 * and the alert rings again the moment it does.
 */
function buildBellRows(args: {
  attention: { subject: Subject; summary: AttendanceSummary }[];
  overdue: number;
  exam: Task | undefined;
  today: string;
  unmarked: { count: number; latest: string | null };
}): BellRow[] {
  const { attention, overdue, exam, today, unmarked } = args;
  const rows: BellRow[] = [];
  for (const { subject, summary } of attention.slice(0, 5)) {
    rows.push({
      key: `att:${subject.id}:${summary.state}:${Math.round(summary.pct ?? 0)}`,
      icon: TriangleAlert,
      tone: summary.state === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn",
      title: `${subject.name} · ${fmtPct(summary.pct)}`,
      body: describe(summary),
      href: "/attendance",
    });
  }
  if (overdue > 0)
    rows.push({ key: `overdue:${overdue}`, icon: ClipboardList, tone: "bg-danger-soft text-danger", title: `${overdue} overdue ${overdue === 1 ? "task" : "tasks"}`, body: "Finish them or move the date", href: "/tasks" });
  if (exam?.dueDate)
    rows.push({ key: `exam:${exam.id}:${exam.dueDate}`, icon: GraduationCap, tone: "bg-accent-soft text-accent", title: exam.title, body: `Exam · ${countdownText(daysBetween(today, exam.dueDate))}`, href: "/tasks" });
  if (unmarked.count > 0)
    rows.push({ key: `unmarked:${unmarked.count}`, icon: ClipboardList, tone: "bg-warn-soft text-warn", title: `${unmarked.count} past ${unmarked.count === 1 ? "class" : "classes"} not marked`, body: "Catch up to keep your numbers right", href: "/attendance" });
  return rows;
}

function Updates({
  rows,
  read,
  onMarkRead,
  onClose,
}: {
  rows: BellRow[];
  read: Set<string>;
  onMarkRead: (keys: string[]) => void;
  onClose: () => void;
}) {
  const unreadRows = rows.filter((r) => !read.has(r.key));

  if (rows.length === 0 || unreadRows.length === 0)
    return (
      <div className="pb-4 text-center">
        <Cap3D size={72} className="mx-auto" />
        <p className="mt-2 text-[16px] font-extrabold">All caught up</p>
        <p className="mt-1 text-[13.5px] text-muted">{rows.length ? "Everything here is marked read." : "Every subject is above target and nothing is overdue."}</p>
      </div>
    );

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button onClick={() => onMarkRead(rows.map((r) => r.key))} className="text-[13px] font-bold text-accent">
          Mark all as read
        </button>
      </div>
      <ul className="space-y-3 pb-2">
        {unreadRows.map((r) => (
          <li key={r.key} className="lift flex items-center gap-3 rounded-2xl px-3.5 py-3">
            <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", r.tone)}>
              <r.icon size={18} strokeWidth={2.3} />
            </span>
            <Link href={r.href} onClick={onClose} className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold">{r.title}</span>
              <span className="block truncate text-[12.5px] text-muted">{r.body}</span>
            </Link>
            <button
              onClick={() => onMarkRead([r.key])}
              aria-label="Mark as read"
              className="btn-paper lip-sm grid size-8 shrink-0 place-items-center rounded-full text-muted"
            >
              <Check size={15} strokeWidth={2.75} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
