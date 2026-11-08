"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TodaySkeleton } from "@/components/Skeleton";
import { ConnectCamu } from "@/components/College";
import { getProfile } from "@/lib/repo";
import { useSlots, useSubjects } from "@/lib/hooks";
import { classesOn, cleanName, colorFor, subjectOf, useAttendanceData } from "@/lib/college";
import { addDays, fmtTime, toDateStr, weekdayOf, WEEKDAYS_SHORT } from "@/lib/dates";
import { appliesOn } from "@/lib/repo";
import { EmptyState, cx } from "@/components/ui";

/** Monday of the week that `date` falls in. */
function mondayOf(date: string): string {
  const wd = weekdayOf(date); // 0 = Sun
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

interface Row {
  id: string;
  name: string;
  from: string;
  to: string;
  room: string;
  teacher: string;
  color: string;
  /** What Camu recorded for this class, when it is in the past. */
  status: "present" | "absent" | null;
}

export default function TimetablePage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const target = profile?.target ?? 75;
  const { data, camu, native } = useAttendanceData(target);
  const slots = useSlots();
  const subjects = useSubjects();
  const today = toDateStr();
  const [date, setDate] = useState(today);

  const weekStart = mondayOf(date);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const rows = useMemo<Row[]>(() => {
    if (camu) {
      // Camu's own record for this day (present / absent per class), matched by time.
      const marks = (data?.sessions ?? []).filter((s) => s.date === date);
      const statusAt = (subId: string, from: string): Row["status"] => {
        const m = marks.find((x) => x.start === from && (x.subjectId === `camu:${subId}` || x.subjectId.endsWith(subId)));
        return m && (m.status === "present" || m.status === "absent") ? m.status : null;
      };
      return classesOn(camu, date)
        .map((p) => {
          const sub = subjectOf(p, camu.subjects ?? []);
          return {
            id: `${p.subId}-${p.from}`,
            name: cleanName(p.name),
            from: p.from,
            to: p.to,
            room: p.room,
            teacher: p.teacher,
            color: colorFor(sub?.id ?? p.subId ?? p.name),
            status: statusAt(p.subId, p.from),
          };
        })
        .sort((a, b) => a.from.localeCompare(b.from));
    }
    const byId = new Map((subjects ?? []).map((s) => [s.id, s]));
    const wd = weekdayOf(date);
    return (slots ?? [])
      .filter((s) => s.weekday === wd && appliesOn(s, date))
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((s) => {
        const sub = byId.get(s.subjectId);
        return {
          id: s.id,
          name: sub?.name ?? "Class",
          from: s.start,
          to: s.end,
          room: s.room ?? "",
          teacher: "",
          color: sub?.color ?? colorFor(s.subjectId),
          status: null,
        };
      });
  }, [camu, date, slots, subjects, data]);

  if (!profile || (native && !data)) return <TodaySkeleton />;

  const hasManual = (slots?.length ?? 0) > 0;

  return (
    <div className="page-wash stagger min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <PageHeader
        title="Timetable"
        right={
          <Link
            href="/attendance/timetable"
            aria-label="Edit timetable"
            className="grid size-10 place-items-center rounded-full bg-surface text-accent shadow-[0_0_0_1px_var(--line)]"
          >
            <CalendarClock size={19} />
          </Link>
        }
      />

      {!camu && native && !hasManual ? (
        <div className="mx-5 mt-2">
          <ConnectCamu />
        </div>
      ) : null}

      {/* Week selector */}
      <div className="mx-5 mt-1 flex items-center justify-between">
        <button
          aria-label="Previous week"
          onClick={() => setDate(addDays(weekStart, -7))}
          className="grid size-10 place-items-center rounded-full bg-surface shadow-[0_0_0_1px_var(--line)]"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="font-display text-[15px] font-semibold tnum">
          {rangeLabel(week[0], week[6])}
        </p>
        <button
          aria-label="Next week"
          onClick={() => setDate(addDays(weekStart, 7))}
          className="grid size-10 place-items-center rounded-full bg-surface shadow-[0_0_0_1px_var(--line)]"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day picker */}
      <div className="mt-4 grid grid-cols-7 gap-1.5 px-5">
        {week.map((d) => {
          const on = d === date;
          return (
            <button
              key={d}
              onClick={() => setDate(d)}
              className={cx(
                "flex flex-col items-center gap-1 rounded-2xl py-2.5 transition",
                on ? "bg-accent text-on-accent" : "bg-surface text-text shadow-[0_0_0_1px_var(--line)]",
              )}
            >
              <span className={cx("text-[11px] font-medium", on ? "text-on-accent/80" : "text-muted")}>
                {WEEKDAYS_SHORT[weekdayOf(d)]}
              </span>
              <span className="font-display text-[16px] font-semibold tnum">{Number(d.split("-")[2])}</span>
              {d === today && (
                <span className={cx("size-1 rounded-full", on ? "bg-white" : "bg-accent")} />
              )}
            </button>
          );
        })}
      </div>

      {/* Day heading */}
      <div className="mt-6 flex items-baseline justify-between px-5">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.02em]">{fullDay(date)}</h2>
        <span className="text-[13px] text-muted">
          {rows.length} {rows.length === 1 ? "class" : "classes"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No classes"
            body={camu ? "Nothing on Camu's timetable for this day." : hasManual ? "A free day." : "Connect Camu or add your classes to see them here."}
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-3 px-5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="lift flex items-stretch gap-3.5 overflow-hidden rounded-2xl bg-surface p-4"
            >
              <span className="w-1 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-[15.5px] font-semibold leading-snug [overflow-wrap:anywhere]">
                    {r.name}
                  </p>
                  {r.status ? (
                    <span
                      className={cx(
                        "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                        r.status === "present" ? "bg-safe-soft text-safe" : "bg-danger-soft text-danger",
                      )}
                    >
                      {r.status === "present" ? "Present" : "Absent"}
                    </span>
                  ) : (
                    r.teacher && (
                      <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-muted">
                        {r.teacher}
                      </span>
                    )
                  )}
                </div>
                {r.status && r.teacher && (
                  <p className="mt-0.5 text-[12px] text-muted">{r.teacher}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                  <span className="inline-flex items-center gap-1.5 tnum">
                    <Clock size={14} /> {fmtTime(r.from)} – {fmtTime(r.to)}
                  </span>
                  {r.room && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={14} /> {r.room}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function rangeLabel(a: string, b: string): string {
  const d = (s: string) => Number(s.split("-")[2]);
  const mon = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { month: "short" });
  return mon(a) === mon(b) ? `${d(a)} – ${d(b)} ${mon(b)}` : `${d(a)} ${mon(a)} – ${d(b)} ${mon(b)}`;
}

function fullDay(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}
