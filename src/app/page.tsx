"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  HandCoins,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  GraduationCap,
  ListChecks,
  Minus,
  PartyPopper,
  Plus,
  Receipt,
  Wallet,
  X,
} from "lucide-react";
import { StickyBar } from "@/components/PageHeader";
import { Logo } from "@/components/Logo";
import { TodaySkeleton } from "@/components/Skeleton";
import { appliesOn, ensureSessionsSince, getProfile, setSessionStatus } from "@/lib/repo";
import { useEvents, useExpenses, useSessionsOn, useSlots, useTasks } from "@/lib/hooks";
import { holidayLastDay, holidayOn, nextClass, useAttendanceData, type ViewSession } from "@/lib/college";
import { CamuStatus } from "@/components/College";
import { eventsOn, holidayLength } from "@/lib/calendar";
import { KIND_BY_ID, bucketOf, compareTasks, countdownText, daysBetween, dueLabel } from "@/lib/tasks";
import { fmtMoney, monthKey, sum } from "@/lib/money";
import {
  addDays,
  fmtDayLong,
  fmtDuration,
  fmtTime,
  nowHM,
  relativeDayLabel,
  toDateStr,
  toMinutes,
  weekdayOf,
  WEEKDAYS_LONG,
} from "@/lib/dates";
import { computeStreak, describe, fmtPct, weekForm, type DayForm } from "@/lib/attendance";
import type { Session, SessionStatus, Slot, Subject } from "@/lib/types";
import {
  EmptyState,
  Avatar,
  STATE_TEXT,
  SubjectTile,
  cx,
  useToast,
} from "@/components/ui";

function useNow(): { today: string; hm: string } {
  const [now, setNow] = useState(() => ({ today: toDateStr(), hm: nowHM() }));
  useEffect(() => {
    const id = setInterval(() => setNow({ today: toDateStr(), hm: nowHM() }), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function TodayPage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const { today, hm } = useNow();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const target = profile?.target ?? 75;

  const { data, camu } = useAttendanceData(target);
  const slots = useSlots();
  const expenses = useExpenses();
  const tasks = useTasks();
  const dueSoon = useMemo(() => {
    const pending = (tasks ?? []).filter((t) => !t.done);
    const soon = pending
      .filter((t) => {
        const b = bucketOf(t, today);
        return b === "overdue" || b === "today" || b === "tomorrow";
      })
      .sort(compareTasks);
    const week = pending.filter((t) => t.dueDate && daysBetween(today, t.dueDate) >= 0 && daysBetween(today, t.dueDate) <= 7).length;
    const overdue = pending.filter((t) => bucketOf(t, today) === "overdue").length;
    const exam = pending
      .filter((t) => t.kind === "exam" && t.dueDate && t.dueDate >= today)
      .sort(compareTasks)[0];
    return { soon, week, overdue, exam };
  }, [tasks, today]);
  const spentMonth = useMemo(
    () => sum((expenses ?? []).filter((e) => monthKey(e.date) === monthKey(today))),
    [expenses, today],
  );
  const localDay = useSessionsOn(date);
  const localToday = useSessionsOn(today);
  // With Camu connected the day comes from Camu's timetable and record instead.
  const sessions: ViewSession[] | undefined = camu ? data?.sessions.filter((s) => s.date === date) : localDay;
  const todaySessions: ViewSession[] | undefined = camu ? data?.sessions.filter((s) => s.date === today) : localToday;
  const events = useEvents();
  // A day off is a fact about the day, not the absence of one. Without this a
  // holiday looked exactly like a day somebody had forgotten to mark.
  const dayOff = useMemo(() => {
    const h = camu ? holidayOn(camu, date) : null;
    if (h) return [{ id: `camu-${h.start}`, title: h.title, kind: "holiday" as const, date: h.start, endDate: holidayLastDay(h), note: "", createdAt: 0, updatedAt: 0 }];
    return eventsOn(events ?? [], date).holidays;
  }, [events, date, camu]);
  const upcoming = useMemo(() => {
    if (!camu) return null;
    const n = nextClass(camu, today, hm);
    if (!n) return null;
    const when = n.date === today ? "today" : n.date === addDays(today, 1) ? "tomorrow" : WEEKDAYS_LONG[weekdayOf(n.date)];
    return `Next: ${cleanTitle(n.name)} ${when}, ${fmtTime(n.from)}${n.room ? ` · ${n.room}` : ""}`;
  }, [camu, today, hm]);

  // Create the classes of every day since the user joined (max 30 days back),
  // so missed days show up as "not marked" and can be caught up on.
  const joined = profile ? toDateStr(new Date(profile.createdAt)) : null;
  useEffect(() => {
    if (!joined) return;
    const earliest = addDays(today, -30);
    ensureSessionsSince(joined > earliest ? joined : earliest, today);
  }, [joined, today, slots]);

  const subjectById = useMemo(
    () => new Map(data?.subjects.map((s) => [s.id, s]) ?? []),
    [data],
  );

  const attention = useMemo(() => {
    if (!data) return [];
    return data.stats
      .filter((s) => s.summary.state === "danger" || s.summary.state === "warn")
      .sort((a, b) => (a.summary.pct ?? 0) - (b.summary.pct ?? 0));
  }, [data]);

  const streak = useMemo(
    () => (data ? computeStreak(data.sessions, today) : 0),
    [data, today],
  );

  const unmarkedPast = useMemo(() => {
    if (!data) return { count: 0, latest: null as string | null };
    const live = new Set(data.subjects.map((s) => s.id));
    const list = data.sessions.filter(
      (s) => s.date < today && s.status === "unmarked" && live.has(s.subjectId),
    );
    const latest = list.reduce<string | null>(
      (m, s) => (m === null || s.date > m ? s.date : m),
      null,
    );
    return { count: list.length, latest };
  }, [data, today]);

  if (!profile || !data) return <TodaySkeleton />;

  const overall = data.overall;
  const name = profile.name || "there";

  const week = weekForm(data.sessions, today);

  return (
    <div className="page-wash">
      <StickyBar className="px-5 pb-2">
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={30} />
            <p className="font-display text-[19px] font-bold tracking-[-0.03em]">DockIn</p>
          </div>
          <Link href="/settings" aria-label="Profile and settings" className="rounded-full transition active:scale-95">
            <Avatar name={name} avatar={profile.avatar} size={40} />
          </Link>
        </div>
      </StickyBar>

      <div className="px-5 pt-1">
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em]">
          Hi, {name.split(" ")[0]} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-0.5 text-[13.5px] text-muted">{fmtDayLong(today)}</p>
      </div>

      <DayHero
        today={today}
        hm={hm}
        sessions={todaySessions}
        subjectById={subjectById}
        slots={camu ? [] : slots ?? []}
        upcoming={upcoming}
        fromCamu={!!camu}
      />
      {camu && <CamuStatus camu={camu} className="mt-2" />}

      {(streak > 0 || (overall.state !== "none" && Number.isFinite(overall.canMiss))) && (
        <div className="mt-4 flex flex-wrap gap-2 px-5">
          {streak > 0 && !camu && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-warn-soft px-3 text-[13px] font-medium text-warn">
              <Flame size={15} /> {streak}-day marking streak
            </span>
          )}
          {overall.state !== "none" && overall.state !== "danger" && Number.isFinite(overall.canMiss) && (
            <span className="inline-flex h-8 items-center rounded-full bg-surface px-3 text-[13px] font-medium text-muted shadow-[0_0_0_1px_var(--line)]">
              Bunk budget: {overall.canMiss} {overall.canMiss === 1 ? "class" : "classes"}
            </span>
          )}
        </div>
      )}

      {/* One card, three facts.
          This was four pastel tiles in a two-by-two grid, each a different
          colour, each a different height. Four colours with no meaning behind
          them is noise, and the eye had nowhere to land. One surface with three
          columns reads in a glance and leaves the colour to say something: the
          attendance figure, and only that, is tinted by how it is going. */}
      <WeekStrip week={week} today={today} />

      <section
        className="lift mx-5 mt-5 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-3xl bg-surface"
        aria-label="At a glance"
      >
        <Glance
          href="/attendance"
          icon={CalendarCheck}
          label="Attendance"
          value={fmtPct(overall.pct)}
          ink={STATE_TEXT[overall.state]}
          hint={
            overall.state === "none"
              ? "Mark a class"
              : attention.length > 0
                ? `${attention.length} to watch`
                : "All safe"
          }
        />
        <Glance
          href="/money"
          icon={Wallet}
          label="Spent"
          value={fmtMoney(spentMonth)}
          hint="This month"
        />
        <Glance
          href="/tasks"
          icon={ListChecks}
          label="Due"
          value={String(dueSoon.week)}
          hint={dueSoon.overdue > 0 ? `${dueSoon.overdue} overdue` : "This week"}
          ink={dueSoon.overdue > 0 ? "text-danger" : undefined}
        />
      </section>

      {dueSoon.exam?.dueDate && (
        <Link
          href="/tasks"
          className="mx-5 mt-3 flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)] transition active:scale-[0.99]"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-soft text-rose">
            <GraduationCap size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-medium">{dueSoon.exam.title}</span>
            <span className="block text-[12.5px] text-muted">Next exam</span>
          </span>
          <span className="shrink-0 text-[13px] font-medium text-rose">
            {countdownText(daysBetween(today, dueSoon.exam.dueDate))}
          </span>
        </Link>
      )}

      {unmarkedPast.count > 0 && !camu && (
        <button
          onClick={() => setPicked(unmarkedPast.latest)}
          className="mx-5 mt-5 flex w-[calc(100%-2.5rem)] items-center justify-between rounded-2xl bg-accent-soft px-4 py-3 text-left"
        >
          <span>
            <span className="block text-[15px] font-semibold text-accent">
              {unmarkedPast.count} past {unmarkedPast.count === 1 ? "class is" : "classes are"} not marked
            </span>
            <span className="block text-[13px] text-muted">Catch up to keep your numbers right</span>
          </span>
          <ArrowRight size={18} className="text-accent" />
        </button>
      )}

      <div className="mt-7 flex items-center justify-between px-5">
        <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em]">
          {relativeDayLabel(date, today)}
          {date !== today && (
            <span className="ml-2 text-sm font-normal text-muted">{fmtDayLong(date)}</span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {date !== today && (
            <button
              onClick={() => setPicked(null)}
              className="mr-1 h-9 rounded-full px-3 text-sm font-medium text-accent"
            >
              Today
            </button>
          )}
          <button
            aria-label="Previous day"
            onClick={() => setPicked(addDays(date, -1))}
            className="grid size-9 place-items-center rounded-full bg-surface shadow-[0_0_0_1px_var(--line)]"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="Next day"
            onClick={() => setPicked(addDays(date, 1))}
            className="grid size-9 place-items-center rounded-full bg-surface shadow-[0_0_0_1px_var(--line)]"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {dayOff.length > 0 && (
        <div className="mx-5 mt-3 flex items-center gap-3 rounded-2xl bg-violet-soft px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface/70 text-violet">
            <PartyPopper size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14.5px] font-medium text-violet">{dayOff[0].title}</p>
            <p className="text-[12.5px] text-muted">
              Holiday{holidayLength(dayOff[0]) > 1 ? ` · ${holidayLength(dayOff[0])} days` : ""} · classes
              do not count against your attendance
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 px-5">
        {sessions === undefined ? null : sessions.length === 0 ? (
          <div className="-mx-5">
            <EmptyState
              title={camu || (slots?.length ?? 0) > 0 ? "No classes this day" : "No timetable yet"}
              body={
                camu
                  ? dayOff.length
                    ? "It is a holiday."
                    : "Nothing on Camu's timetable."
                  : (slots?.length ?? 0) > 0
                    ? "Enjoy the free time."
                    : "Add your subjects and weekly classes to see them here."
              }
              action={
                !camu && (slots?.length ?? 0) === 0 && (
                  <Link
                    href="/attendance/timetable"
                    className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-on-accent"
                  >
                    Set up timetable
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
            {sessions.map((s) =>
              s.camu ? (
                <CamuClassRow
                  key={s.id}
                  session={s}
                  subject={subjectById.get(s.subjectId)}
                  live={date === today && toMinutes(s.start) <= toMinutes(hm) && toMinutes(hm) < toMinutes(s.end)}
                  past={date < today || (date === today && toMinutes(s.end) <= toMinutes(hm))}
                />
              ) : (
                <ClassRow
                  key={s.id}
                  session={s}
                  subject={subjectById.get(s.subjectId)}
                  live={date === today && toMinutes(s.start) <= toMinutes(hm) && toMinutes(hm) < toMinutes(s.end)}
                />
              ),
            )}
          </ul>
        )}
      </div>

      {dueSoon.soon.length > 0 && (
        <section className="mt-7 px-5" aria-label="Due soon">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">Due soon</h2>
            <Link href="/tasks" className="text-sm font-medium text-accent">
              See all
            </Link>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
            {dueSoon.soon.slice(0, 3).map((t) => (
              <li key={t.id}>
                <Link href="/tasks" className="flex items-center gap-3 px-4 py-3">
                  <span className={cx("size-2.5 shrink-0 rounded-full", t.kind === "exam" ? "bg-rose" : "bg-violet")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{t.title}</span>
                    <span className={cx("text-[13px]", bucketOf(t, today) === "overdue" ? "text-danger" : "text-muted")}>
                      {KIND_BY_ID[t.kind].label} · {dueLabel(t, today)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-7 px-5" aria-label="Quick actions">
        <div className="lift grid grid-cols-4 divide-x divide-line overflow-hidden rounded-2xl bg-surface">
          {(camu ? QUICK_CAMU : QUICK).map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex flex-col items-center gap-1.5 py-3.5 text-center transition active:scale-[0.97]"
            >
              <Icon size={20} className="text-muted" />
              <span className="text-[12px] leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {attention.length > 0 && (
        <section className="mt-7 px-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">Needs attention</h2>
            <Link href="/attendance" className="text-sm font-medium text-accent">
              See all
            </Link>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
            {attention.slice(0, 3).map(({ subject, summary }) => (
              <li key={subject.id}>
                <Link
                  href={camu ? "/attendance" : `/attendance/${subject.id}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <SubjectTile name={subject.name} code={subject.code} color={subject.color} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{subject.name}</p>
                    <p className={cx("text-[13px]", STATE_TEXT[summary.state])}>
                      {describe(summary)}
                    </p>
                  </div>
                  <span
                    className={cx(
                      "text-[17px] font-semibold tabular-nums",
                      STATE_TEXT[summary.state],
                    )}
                  >
                    {fmtPct(summary.pct)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Four ways in. They are four equal shortcuts, so they look like four equal
 * shortcuts: one surface, one weight, no colour pretending to mean something.
 */
const QUICK = [
  { href: "/attendance", label: "Mark", icon: CalendarCheck },
  { href: "/add", label: "Expense", icon: Receipt },
  { href: "/tasks?new=1", label: "Task", icon: Plus },
  { href: "/attendance/timetable", label: "Timetable", icon: GraduationCap },
];

/** With Camu doing the marking, the shortcuts are to the things still done by hand. */
const QUICK_CAMU = [
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/add", label: "Expense", icon: Receipt },
  { href: "/tasks", label: "Tasks", icon: BookOpen },
  { href: "/money#dues", label: "Lena-dena", icon: HandCoins },
];

/** "Database Management Systems ( P-LA-203 )" → "Database Management Systems". */
function cleanTitle(name: string): string {
  return name.replace(/\s*\(\s*[^)]*\)?\s*$/, "").trim();
}

// ---------- up-next card ----------

const DOT_SOFT: Record<SessionStatus, string> = {
  present: "bg-safe",
  absent: "bg-danger",
  cancelled: "bg-muted/40",
  holiday: "bg-muted/35",
  unmarked: "bg-accent/25",
};

function DayHero({
  today,
  hm,
  sessions,
  subjectById,
  slots,
  upcoming,
  fromCamu,
}: {
  today: string;
  hm: string;
  sessions: Session[] | undefined;
  subjectById: Map<string, Subject>;
  slots: Slot[];
  /** With Camu, the next class line is worked out by the caller. */
  upcoming?: string | null;
  fromCamu?: boolean;
}) {
  const nowMin = toMinutes(hm);
  const list = sessions ?? [];
  const ongoing = list.find((s) => toMinutes(s.start) <= nowMin && nowMin < toMinutes(s.end));
  const next = list.find((s) => toMinutes(s.start) > nowMin);
  const marked = list.filter((s) => s.status !== "unmarked").length;

  let eyebrow = "Today";
  let title = "No classes today";
  let sub = fmtDayLong(today);

  if (list.length > 0) {
    if (ongoing) {
      const sub1 = subjectById.get(ongoing.subjectId);
      eyebrow = "Happening now";
      title = sub1?.name ?? "Class";
      const room = (ongoing as ViewSession).room;
      sub = `Until ${fmtTime(ongoing.end)} · ${fmtDuration(toMinutes(ongoing.end) - nowMin)} left${room ? ` · ${room}` : ""}`;
    } else if (next) {
      const sub1 = subjectById.get(next.subjectId);
      eyebrow = "Up next";
      title = sub1?.name ?? "Class";
      const room = (next as ViewSession).room;
      sub = `${fmtTime(next.start)} · in ${fmtDuration(toMinutes(next.start) - nowMin)}${room ? ` · ${room}` : ""}`;
    } else {
      eyebrow = "Done for the day";
      title = marked === list.length ? "All classes marked" : "Classes are over";
      sub =
        marked === list.length
          ? fromCamu
            ? "Camu has marked every class."
            : "Nice. Nothing left to track."
          : fromCamu
            ? upcoming ?? `${list.length - marked} not marked on Camu yet`
            : `${list.length - marked} still to mark`;
    }
  } else if (fromCamu) {
    eyebrow = "Free day";
    sub = upcoming ?? "Nothing on Camu's timetable this week";
  } else {
    // find the next day that has a class
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i);
      const wd = weekdayOf(d);
      const first = slots
        .filter((s) => s.weekday === wd && appliesOn(s, d))
        .sort((a, b) => a.start.localeCompare(b.start))[0];
      if (first) {
        const sub1 = subjectById.get(first.subjectId);
        eyebrow = "Free day";
        title = "No classes today";
        sub = `Next: ${sub1?.name ?? "class"} on ${i === 1 ? "tomorrow" : WEEKDAYS_LONG[wd]}, ${fmtTime(first.start)}`;
        break;
      }
    }
  }

  // The badge on the right: how far off the next/ongoing class is.
  let badge: string | null = null;
  if (ongoing) badge = `${fmtDuration(toMinutes(ongoing.end) - nowMin)} left`;
  else if (next) badge = `in ${fmtDuration(toMinutes(next.start) - nowMin)}`;

  return (
    <section
      className="relative mx-5 mt-4 overflow-hidden rounded-[22px] bg-accent-soft p-4"
      aria-label="Up next"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold tracking-wide text-on-accent uppercase">
          {eyebrow}
        </span>
        {badge && <span className="text-[12px] font-semibold text-accent tnum">{badge}</span>}
      </div>
      <p className="mt-2.5 line-clamp-2 text-[18px] font-bold leading-snug text-text">{title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13.5px] text-muted">{sub}</p>
      {list.length > 0 && (
        <div className="mt-3.5">
          <div className="flex gap-1.5" role="img" aria-label={`${marked} of ${list.length} classes marked`}>
            {list.map((s) => (
              <span key={s.id} className={cx("h-1.5 flex-1 rounded-full", DOT_SOFT[s.status])} />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-muted tnum">
            {marked} of {list.length} classes marked{fromCamu ? " on Camu" : ""}
          </p>
        </div>
      )}
    </section>
  );
}

// ---------- tiles and rows ----------

/** Seven squares: how the week actually went, in one line. */
const FORM_TONE: Record<DayForm, string> = {
  all: "bg-safe",
  some: "bg-warn",
  missed: "bg-danger",
  holiday: "bg-violet/40",
  none: "bg-surface-2",
  future: "bg-surface-2/60",
};

const FORM_WORD: Record<DayForm, string> = {
  all: "all present",
  some: "partly missed",
  missed: "missed",
  holiday: "holiday",
  none: "nothing marked",
  future: "still to come",
};

function WeekStrip({ week, today }: { week: { date: string; form: DayForm }[]; today: string }) {
  const marked = week.filter((d) => d.form === "all" || d.form === "some").length;
  return (
    <section className="lift mx-5 mt-5 rounded-3xl bg-surface p-4" aria-label="Your week">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Your week</h2>
        <p className="text-[12.5px] text-muted">
          {marked > 0 ? `${marked} of 7 days attended` : "Nothing marked yet"}
        </p>
      </div>
      <ol className="mt-3 flex gap-1.5">
        {week.map((d) => (
          <li key={d.date} className="min-w-0 flex-1 text-center">
            <span
              title={`${d.date}: ${FORM_WORD[d.form]}`}
              className={cx(
                "block h-9 rounded-xl transition",
                FORM_TONE[d.form],
                d.date === today && "ring-2 ring-text/70",
              )}
            />
            <span className="mt-1 block text-[10.5px] text-muted">
              {WEEKDAYS_LONG[weekdayOf(d.date)].slice(0, 1)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Glance({
  href,
  icon: Icon,
  label,
  value,
  hint,
  ink,
}: {
  href: string;
  icon: typeof Wallet;
  label: string;
  value: string;
  hint: string;
  ink?: string;
}) {
  return (
    <Link href={href} className="min-w-0 px-3 py-4 text-center transition active:scale-[0.97]">
      <Icon size={15} className="mx-auto text-muted" />
      <p className={cx("font-display mt-2.5 truncate text-[23px] leading-none font-semibold tnum", ink ?? "text-text")}>
        {value}
      </p>
      <p className="mt-2 truncate text-[12px] font-medium">{label}</p>
      <p className="truncate text-[11px] text-muted">{hint}</p>
    </Link>
  );
}

const ACTIONS: {
  status: SessionStatus;
  label: string;
  icon: typeof Check;
  on: string;
}[] = [
  { status: "present", label: "Present", icon: Check, on: "bg-safe text-white" },
  { status: "absent", label: "Absent", icon: X, on: "bg-danger text-white" },
  { status: "cancelled", label: "Cancelled", icon: Minus, on: "bg-text text-bg" },
];

function ClassRow({
  session,
  subject,
  live,
}: {
  session: Session;
  subject: Subject | undefined;
  live: boolean;
}) {
  const toast = useToast();
  const name = subject?.name ?? "Subject";
  const code = subject?.code ?? "";

  async function mark(next: SessionStatus) {
    const prev = session.status;
    const status = prev === next ? "unmarked" : next;
    await setSessionStatus(session.id, status);
    toast.show(
      status === "unmarked"
        ? "Cleared"
        : `${code || name}: ${status === "cancelled" ? "class cancelled" : `marked ${status}`}`,
      () => setSessionStatus(session.id, prev),
    );
  }

  return (
    // Wrapping rather than a breakpoint: on a narrow phone, or with the text
    // turned up, the three buttons drop to their own line instead of squeezing
    // the subject name into "Data Structu…".
    <li className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3", live && "bg-accent-soft")}>
      <div className="w-[2.6rem] shrink-0 text-center leading-tight tabular-nums">
        <p className="text-[15px] font-semibold">{fmtTime(session.start).replace(/ (am|pm)/, "")}</p>
        <p className="text-[11px] uppercase text-muted">{fmtTime(session.start).slice(-2)}</p>
      </div>
      <span className="h-9 w-1 shrink-0 self-center rounded-full" style={{ background: subject?.color ?? "#888" }} aria-hidden />
      <div className="min-w-[6.5rem] flex-1">
        <p className="line-clamp-2 text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{name}</p>
        <p className="text-[13px] leading-snug text-muted">
          {session.kind === "practical" ? "Lab" : "Lecture"} · to {fmtTime(session.end)}
          {live && <span className="ml-1.5 font-semibold text-accent">· Now</span>}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 gap-1" role="group" aria-label={`Mark ${name}`}>
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
                "grid size-9 place-items-center rounded-xl transition active:scale-95",
                selected ? on : "bg-surface-2 text-muted",
              )}
            >
              <Icon size={18} strokeWidth={2.5} />
            </button>
          );
        })}
      </div>
    </li>
  );
}

/** A class as Camu has it: time, room and teacher, and what Camu marked. Nothing to tap. */
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
  const status =
    session.status === "present"
      ? { text: "Present", tone: "bg-safe-soft text-safe" }
      : session.status === "absent"
        ? { text: "Absent", tone: "bg-danger-soft text-danger" }
        : past
          ? { text: "Not marked yet", tone: "bg-surface-2 text-muted" }
          : null;
  return (
    <li className={cx("flex items-center gap-3 px-3.5 py-3", live && "bg-accent-soft")}>
      <div className="w-[2.6rem] shrink-0 text-center leading-tight tabular-nums">
        <p className="text-[15px] font-semibold">{fmtTime(session.start).replace(/ (am|pm)/, "")}</p>
        <p className="text-[11px] uppercase text-muted">{fmtTime(session.start).slice(-2)}</p>
      </div>
      <span className="h-9 w-1 shrink-0 self-center rounded-full" style={{ background: subject?.color ?? "#888" }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{name}</p>
        <p className="truncate text-[13px] leading-snug text-muted">
          {session.room || (session.kind === "practical" ? "Lab" : "Lecture")} · to {fmtTime(session.end)}
          {session.teacher ? ` · ${session.teacher}` : ""}
          {live && <span className="ml-1.5 font-semibold text-accent">· Now</span>}
        </p>
        {session.usual && <p className="text-[11.5px] text-muted">Usual timetable · Camu has not posted this day yet</p>}
      </div>
      {status && (
        <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium", status.tone)}>{status.text}</span>
      )}
    </li>
  );
}
