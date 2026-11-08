"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  Minus,
  PartyPopper,
  TriangleAlert,
  X,
} from "lucide-react";
import { StickyBar } from "@/components/PageHeader";
import { TodaySkeleton } from "@/components/Skeleton";
import { appliesOn, ensureSessionsSince, getProfile, setSessionStatus, setTaskDone } from "@/lib/repo";
import { useEvents, useSessionsOn, useSlots, useTasks } from "@/lib/hooks";
import { holidayLastDay, holidayOn, nextClass, useAttendanceData, type ViewSession } from "@/lib/college";
import { CamuStatus } from "@/components/College";
import { eventsOn, holidayLength } from "@/lib/calendar";
import { KIND_BY_ID, bucketOf, compareTasks, countdownText, daysBetween, dueLabel } from "@/lib/tasks";
import {
  addDays,
  fmtDay,
  fmtDuration,
  fmtTime,
  greetingFor,
  nowHM,
  relativeDayLabel,
  toDateStr,
  toMinutes,
  weekdayOf,
  WEEKDAYS_LONG,
} from "@/lib/dates";
import { describe, fmtPct, weekChange } from "@/lib/attendance";
import type { AttendanceSummary, Session, SessionStatus, Slot, Subject, Task } from "@/lib/types";
import type { CamuState } from "@/lib/native";
import { Avatar, Sheet, cx, useCountUp, useToast } from "@/components/ui";
import {
  BookTile,
  Cap3D,
  InkBar,
  Notebook,
  PaperCheck,
  PaperIconButton,
  PenArt,
  SectionTitle,
  TrendPill,
} from "@/components/Paper";

function useNow(): { today: string; hm: string } {
  const [now, setNow] = useState(() => ({ today: toDateStr(), hm: nowHM() }));
  useEffect(() => {
    const id = setInterval(() => setNow({ today: toDateStr(), hm: nowHM() }), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** "Database Management Systems ( P-LA-203 )" → "Database Management Systems". */
function cleanTitle(name: string): string {
  return name.replace(/\s*\(\s*[^)]*\)?\s*$/, "").trim();
}

/** "9:00 am" → "9:00 AM", the way it is written on a timetable. */
const clock = (t: string) => fmtTime(t).toUpperCase();

interface NextUp {
  label: string;
  title: string;
  when: string;
  room?: string;
  badge?: string;
}

export default function TodayPage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const { today, hm } = useNow();
  const [picked, setPicked] = useState<string | null>(null);
  const [bell, setBell] = useState(false);
  const date = picked ?? today;
  const target = profile?.target ?? 75;

  const { data, camu } = useAttendanceData(target);
  const slots = useSlots();
  const tasks = useTasks();
  const events = useEvents();
  const localDay = useSessionsOn(date);
  const localToday = useSessionsOn(today);
  // With Camu connected the day comes from Camu's timetable and record instead.
  const sessions: ViewSession[] | undefined = camu ? data?.sessions.filter((s) => s.date === date) : localDay;
  const todaySessions: ViewSession[] | undefined = camu ? data?.sessions.filter((s) => s.date === today) : localToday;

  // Create the classes of every day since the user joined (max 30 days back),
  // so missed days show up as "not marked" and can be caught up on.
  const joined = profile ? toDateStr(new Date(profile.createdAt)) : null;
  useEffect(() => {
    if (!joined) return;
    const earliest = addDays(today, -30);
    ensureSessionsSince(joined > earliest ? joined : earliest, today);
  }, [joined, today, slots]);

  const subjectById = useMemo(() => new Map(data?.subjects.map((s) => [s.id, s]) ?? []), [data]);

  // A day off is a fact about the day, not the absence of one.
  const dayOff = useMemo(() => {
    const h = camu ? holidayOn(camu, date) : null;
    if (h) return [{ id: `camu-${h.start}`, title: h.title, kind: "holiday" as const, date: h.start, endDate: holidayLastDay(h), note: "", createdAt: 0, updatedAt: 0 }];
    return eventsOn(events ?? [], date).holidays;
  }, [events, date, camu]);

  const work = useMemo(() => {
    const pending = (tasks ?? []).filter((t) => !t.done).sort(compareTasks);
    const soon = pending.filter((t) => {
      const b = bucketOf(t, today);
      return b === "overdue" || b === "today" || b === "tomorrow";
    });
    const later = pending.filter((t) => t.dueDate && daysBetween(today, t.dueDate) > 1 && daysBetween(today, t.dueDate) <= 7);
    const overdue = pending.filter((t) => bucketOf(t, today) === "overdue").length;
    const exam = pending.filter((t) => t.kind === "exam" && t.dueDate && t.dueDate >= today)[0];
    return { soon, later, overdue, exam };
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

  const trend = useMemo(() => (data ? weekChange(data.sessions, data.overall, today) : null), [data, today]);

  const next = findNext({ todaySessions, hm, subjectById, camu, today, slots: slots ?? [] });

  if (!profile || !data) return <TodaySkeleton />;

  const name = profile.name || "there";
  const urgent =
    attention.some((a) => a.summary.state === "danger") ||
    work.overdue > 0 ||
    unmarkedPast.count > 0 ||
    (!!work.exam?.dueDate && daysBetween(today, work.exam.dueDate) <= 3);
  const greeting = greetingFor().replace(/\b\w/g, (c) => c.toUpperCase());

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

      <NextClassCard next={next} />

      <TasksCard soon={work.soon} later={work.later} today={today} />

      <section className="mt-9" aria-label="Classes">
        <div className="mb-3 flex items-center justify-between gap-2 px-5">
          <h2 className="font-display min-w-0 truncate text-[19px] font-extrabold tracking-[-0.02em]">
            {date === today ? "Today's Classes" : relativeDayLabel(date, today)}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {date !== today && (
              <button onClick={() => setPicked(null)} className="btn-paper lip-sm h-8 rounded-full px-3 text-[12.5px]">
                Today
              </button>
            )}
            <button
              aria-label="Previous day"
              onClick={() => setPicked(addDays(date, -1))}
              className="btn-paper lip-sm grid size-8 place-items-center rounded-full"
            >
              <ChevronLeft size={17} strokeWidth={2.5} />
            </button>
            <button
              aria-label="Next day"
              onClick={() => setPicked(addDays(date, 1))}
              className="btn-paper lip-sm grid size-8 place-items-center rounded-full"
            >
              <ChevronRight size={17} strokeWidth={2.5} />
            </button>
          </div>
        </div>

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

        {sessions === undefined ? null : sessions.length === 0 ? (
          <Notebook rings={false} className="mx-5 px-5 py-6 text-center">
            <p className="font-bold">{camu || (slots?.length ?? 0) > 0 ? "No classes this day" : "No timetable yet"}</p>
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
          <Notebook rings={false} className="margin-rule mx-5 overflow-hidden" label={`Classes ${relativeDayLabel(date, today)}`}>
            <ul>
              {sessions.map((s) => {
                const live = date === today && toMinutes(s.start) <= toMinutes(hm) && toMinutes(hm) < toMinutes(s.end);
                const past = date < today || (date === today && toMinutes(s.end) <= toMinutes(hm));
                return s.camu ? (
                  <CamuClassRow key={s.id} session={s} subject={subjectById.get(s.subjectId)} live={live} past={past} />
                ) : (
                  <ClassRow key={s.id} session={s} subject={subjectById.get(s.subjectId)} live={live} />
                );
              })}
            </ul>
          </Notebook>
        )}
      </section>

      <Sheet open={bell} onClose={() => setBell(false)} title="Updates">
        <Updates
          attention={attention}
          overdue={work.overdue}
          exam={work.exam}
          today={today}
          unmarked={unmarkedPast}
          onUnmarked={(d) => {
            setPicked(d);
            setBell(false);
          }}
          onClose={() => setBell(false)}
        />
      </Sheet>
    </div>
  );
}

/** What is on now, or next: today first, then the coming week. */
function findNext({
  todaySessions,
  hm,
  subjectById,
  camu,
  today,
  slots,
}: {
  todaySessions: ViewSession[] | undefined;
  hm: string;
  subjectById: Map<string, Subject>;
  camu: CamuState | null;
  today: string;
  slots: Slot[];
}): NextUp | null {
  const now = toMinutes(hm);
  const list = (todaySessions ?? [])
    .filter((s) => s.status !== "cancelled" && s.status !== "holiday")
    .sort((a, b) => a.start.localeCompare(b.start));
  const nameOf = (s: Session) => subjectById.get(s.subjectId)?.name ?? "Class";
  const ongoing = list.find((s) => toMinutes(s.start) <= now && now < toMinutes(s.end));
  if (ongoing)
    return {
      label: "Happening now",
      title: nameOf(ongoing),
      when: `Till ${clock(ongoing.end)}`,
      room: (ongoing as ViewSession).room,
      badge: `${fmtDuration(toMinutes(ongoing.end) - now)} left`,
    };
  const later = list.find((s) => toMinutes(s.start) > now);
  if (later)
    return {
      label: "Next Class",
      title: nameOf(later),
      when: clock(later.start),
      room: (later as ViewSession).room,
      badge: `in ${fmtDuration(toMinutes(later.start) - now)}`,
    };
  const dayWord = (d: string) => (d === addDays(today, 1) ? "Tomorrow" : WEEKDAYS_LONG[weekdayOf(d)]);
  if (camu) {
    const n = nextClass(camu, today, hm);
    if (!n) return null;
    return { label: "Next Class", title: cleanTitle(n.name), when: `${dayWord(n.date)}, ${clock(n.from)}`, room: n.room };
  }
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    const wd = weekdayOf(d);
    const first = slots
      .filter((s) => s.weekday === wd && appliesOn(s, d))
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (first)
      return {
        label: "Next Class",
        title: subjectById.get(first.subjectId)?.name ?? "Class",
        when: `${dayWord(d)}, ${clock(first.start)}`,
        room: first.room,
      };
  }
  return null;
}

// ---------- the attendance card ----------

function AttendanceCard({
  overall,
  trend,
  target,
}: {
  overall: AttendanceSummary;
  trend: number | null;
  target: number;
}) {
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

// ---------- next class ----------

function NextClassCard({ next }: { next: NextUp | null }) {
  return (
    <Link href="/timetable" className="mx-5 mt-6 block transition active:scale-[0.99]" aria-label="Timetable">
      <Notebook rings={false} className="flex items-center gap-3.5 p-4">
        <BookTile size={54} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cx("text-[13px] font-bold", next?.label === "Happening now" ? "text-accent" : "text-muted")}>
              {next ? next.label : "Next Class"}
            </p>
            {next?.badge && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent tnum">{next.badge}</span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[17px] leading-snug font-extrabold [overflow-wrap:anywhere]">
            {next ? next.title : "Nothing coming up"}
          </p>
          <p className="mt-0.5 truncate text-[13.5px] font-semibold text-muted tnum">
            {next ? (
              <>
                {next.when}
                {next.room && <> &nbsp;•&nbsp; {next.room}</>}
              </>
            ) : (
              "No classes on the timetable this week"
            )}
          </p>
        </div>
        <ChevronRight size={22} className="shrink-0 text-muted" />
      </Notebook>
    </Link>
  );
}

// ---------- tasks ----------

function TasksCard({ soon, later, today }: { soon: Task[]; later: Task[]; today: string }) {
  const list = (soon.length ? soon : later).slice(0, 4);
  const title = soon.length ? "Today's Tasks" : later.length ? "Coming Up" : "Today's Tasks";
  return (
    <section className="mt-9" aria-label={title}>
      <SectionTitle href="/tasks" link="View all">
        {title}
        {soon.length > 0 && <span className="text-muted"> ({soon.length})</span>}
      </SectionTitle>
      <div className="relative mx-5">
        <Notebook rings={false} className="margin-rule overflow-hidden">
          {list.length === 0 ? (
            <div className="py-6 pr-5 pl-[58px]">
              <p className="font-bold">Nothing due. Enjoy it.</p>
              <p className="mt-0.5 text-[13px] text-muted">Assignments from the LMS show up here by themselves.</p>
              <Link href="/tasks?new=1" className="btn-leather mt-4 inline-flex h-10 items-center rounded-2xl px-4 text-[13.5px]">
                Add a task
              </Link>
            </div>
          ) : (
            <ul>
              {list.map((t) => (
                <TaskLine key={t.id} task={t} today={today} />
              ))}
            </ul>
          )}
          {/* Blank lines at the foot of the page, where the pen rests. */}
          <div className="h-12 border-t border-dashed border-card-edge/70" aria-hidden />
        </Notebook>
        <PenArt className="pointer-events-none absolute -right-2 -bottom-4 w-[158px] rotate-[-12deg] drop-shadow-[0_6px_6px_rgb(60_30_10/0.25)]" />
      </div>
    </section>
  );
}

function TaskLine({ task, today }: { task: Task; today: string }) {
  const toast = useToast();
  const [ticked, setTicked] = useState(false);
  const bucket = bucketOf(task, today);
  const due =
    bucket === "overdue"
      ? { text: "Overdue", tone: "text-danger" }
      : bucket === "today"
        ? { text: "Due Today", tone: "text-orange" }
        : bucket === "tomorrow"
          ? { text: "Due Tomorrow", tone: "text-accent" }
          : { text: dueLabel(task, today), tone: "text-muted" };

  function tick() {
    if (ticked) return;
    setTicked(true);
    // A beat to see the tick land before the line leaves the list.
    setTimeout(() => {
      void setTaskDone(task.id, true);
      toast.show(`Done: ${task.title}`, () => void setTaskDone(task.id, false));
    }, 450);
  }

  return (
    <li className="ruled-row">
      <button
        type="button"
        onClick={tick}
        aria-label={`Mark "${task.title}" done`}
        className="flex w-full items-center gap-3 py-3.5 pr-4 text-left"
      >
        <span className="grid w-[46px] shrink-0 place-items-center">
          <PaperCheck checked={ticked} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate text-[15px] font-bold transition", ticked && "text-muted line-through")}>
            {task.title}
          </span>
          <span className="block truncate text-[12.5px] text-muted">
            {KIND_BY_ID[task.kind].label}
            {task.source === "lms" ? " · LMS" : ""}
            {task.dueTime ? ` · ${clock(task.dueTime)}` : ""}
          </span>
        </span>
        <span className={cx("shrink-0 text-[12.5px] font-extrabold", due.tone)}>{due.text}</span>
      </button>
    </li>
  );
}

// ---------- classes ----------

function TimeCell({ start }: { start: string }) {
  const t = clock(start);
  return (
    <div className="w-[46px] shrink-0 text-center leading-tight tnum">
      <p className="text-[13.5px] font-extrabold">{t.replace(/ (AM|PM)/, "")}</p>
      <p className="text-[10px] font-bold text-muted">{t.slice(-2)}</p>
    </div>
  );
}

const ACTIONS: { status: SessionStatus; label: string; icon: typeof Check; on: string }[] = [
  { status: "present", label: "Present", icon: Check, on: "bg-safe text-white border-safe" },
  { status: "absent", label: "Absent", icon: X, on: "bg-danger text-white border-danger" },
  { status: "cancelled", label: "Cancelled", icon: Minus, on: "bg-text text-bg border-text" },
];

/** A class marked by hand: present, absent or cancelled. */
function ClassRow({ session, subject, live }: { session: Session; subject: Subject | undefined; live: boolean }) {
  const toast = useToast();
  const name = subject?.name ?? "Subject";
  const code = subject?.code ?? "";

  async function mark(next: SessionStatus) {
    const prev = session.status;
    const status = prev === next ? "unmarked" : next;
    await setSessionStatus(session.id, status);
    toast.show(
      status === "unmarked" ? "Cleared" : `${code || name}: ${status === "cancelled" ? "class cancelled" : `marked ${status}`}`,
      () => setSessionStatus(session.id, prev),
    );
  }

  return (
    <li className={cx("ruled-row flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-3.5", live && "bg-accent-soft/60")}>
      <TimeCell start={session.start} />
      <div className="min-w-[6.5rem] flex-1">
        <p className="line-clamp-2 text-[15px] leading-snug font-bold [overflow-wrap:anywhere]">{name}</p>
        <p className="text-[12.5px] leading-snug text-muted">
          {session.kind === "practical" ? "Lab" : "Lecture"} · to {clock(session.end)}
          {live && <span className="ml-1 font-bold text-accent">· Now</span>}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 gap-1.5" role="group" aria-label={`Mark ${name}`}>
        {ACTIONS.map(({ status, label, icon: Icon, on }) => {
          const selected = session.status === status;
          return (
            <button
              key={status}
              onClick={() => mark(status)}
              aria-pressed={selected}
              aria-label={label}
              title={label}
              className={cx(
                "grid size-9 place-items-center rounded-xl border-[1.5px] shadow-[0_2px_0_var(--pbtn-lip)] transition active:translate-y-[2px] active:shadow-none",
                selected ? on : "border-card-edge bg-card text-muted",
              )}
            >
              <Icon size={17} strokeWidth={2.75} />
            </button>
          );
        })}
      </div>
    </li>
  );
}

/** A class as Camu has it: time, room and teacher, and the teacher's mark as a stamp. */
function CamuClassRow({
  session,
  subject,
  live,
  past,
}: {
  session: ViewSession;
  subject: Subject | undefined;
  live: boolean;
  past: boolean;
}) {
  const name = subject?.name ?? "Class";
  return (
    <li className={cx("ruled-row flex items-center gap-3 py-3 pr-3.5", live && "bg-accent-soft/60")}>
      <TimeCell start={session.start} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] leading-snug font-bold [overflow-wrap:anywhere]">{name}</p>
        <p className="truncate text-[12.5px] leading-snug text-muted">
          {session.room || (session.kind === "practical" ? "Lab" : "Lecture")} · to {clock(session.end)}
          {session.teacher ? ` · ${session.teacher}` : ""}
        </p>
        {session.usual && <p className="text-[11px] text-muted">Usual timetable · Camu has not posted this day yet</p>}
      </div>
      {session.status === "present" ? (
        <span className="stamp shrink-0 text-safe">Present</span>
      ) : session.status === "absent" ? (
        <span className="stamp shrink-0 text-danger">Absent</span>
      ) : live ? (
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11.5px] font-bold text-on-accent">Now</span>
      ) : past ? (
        <span className="shrink-0 text-right text-[11px] leading-tight font-semibold text-muted">
          Not marked
          <br />
          yet
        </span>
      ) : null}
    </li>
  );
}

// ---------- the bell ----------

function Updates({
  attention,
  overdue,
  exam,
  today,
  unmarked,
  onUnmarked,
  onClose,
}: {
  attention: { subject: Subject; summary: AttendanceSummary }[];
  overdue: number;
  exam: Task | undefined;
  today: string;
  unmarked: { count: number; latest: string | null };
  onUnmarked: (date: string) => void;
  onClose: () => void;
}) {
  const rows: { key: string; icon: typeof Bell; tone: string; title: string; body: string; href?: string; onClick?: () => void }[] = [];
  for (const { subject, summary } of attention.slice(0, 4)) {
    rows.push({
      key: subject.id,
      icon: TriangleAlert,
      tone: summary.state === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn",
      title: `${subject.name} · ${fmtPct(summary.pct)}`,
      body: describe(summary),
      href: "/attendance",
    });
  }
  if (overdue > 0)
    rows.push({
      key: "overdue",
      icon: ClipboardList,
      tone: "bg-danger-soft text-danger",
      title: `${overdue} overdue ${overdue === 1 ? "task" : "tasks"}`,
      body: "Finish them or move the date",
      href: "/tasks",
    });
  if (exam?.dueDate)
    rows.push({
      key: "exam",
      icon: GraduationCap,
      tone: "bg-accent-soft text-accent",
      title: exam.title,
      body: `Exam · ${countdownText(daysBetween(today, exam.dueDate))}`,
      href: "/tasks",
    });
  if (unmarked.count > 0 && unmarked.latest)
    rows.push({
      key: "unmarked",
      icon: ClipboardList,
      tone: "bg-warn-soft text-warn",
      title: `${unmarked.count} past ${unmarked.count === 1 ? "class is" : "classes are"} not marked`,
      body: "Catch up to keep your numbers right",
      onClick: () => onUnmarked(unmarked.latest!),
    });

  if (rows.length === 0)
    return (
      <div className="pb-4 text-center">
        <Cap3D size={72} className="mx-auto" />
        <p className="mt-2 text-[16px] font-extrabold">All caught up</p>
        <p className="mt-1 text-[13.5px] text-muted">Every subject is above target and nothing is overdue.</p>
      </div>
    );

  return (
    <ul className="space-y-3 pb-2">
      {rows.map((r) => {
        const inner = (
          <>
            <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", r.tone)}>
              <r.icon size={18} strokeWidth={2.3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold">{r.title}</span>
              <span className="block truncate text-[12.5px] text-muted">{r.body}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </>
        );
        const cls = "lift flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.99]";
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} onClick={onClose} className={cls}>
                {inner}
              </Link>
            ) : (
              <button type="button" onClick={r.onClick} className={cls}>
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
