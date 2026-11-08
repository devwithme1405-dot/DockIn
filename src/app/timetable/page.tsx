"use client";

import { useCallback, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TodaySkeleton } from "@/components/Skeleton";
import { ConnectCamu } from "@/components/College";
import { getProfile } from "@/lib/repo";
import { useClassNotes, useSlots, useSubjects } from "@/lib/hooks";
import { classesOn, cleanName, colorFor, subjectOf, useAttendanceData } from "@/lib/college";
import { addDays, fmtTime, nowHM, toDateStr, weekdayOf, WEEKDAYS_SHORT } from "@/lib/dates";
import { appliesOn, classKey, setClassNote } from "@/lib/repo";
import { Ban, Clock3, X } from "lucide-react";
import { EmptyState, cx, useToast } from "@/components/ui";
import { Segmented } from "@/components/Paper";
import { BunkCalculator, HolidayCalendar } from "@/components/Calendar";
import { classesOn as camuClassesOn } from "@/lib/college";

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
  /** Camu subject id, for noting an unmarked class. */
  subId?: string;
}

export default function TimetablePage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const target = profile?.target ?? 75;
  const { data, camu, native } = useAttendanceData(target);
  const slots = useSlots();
  const subjects = useSubjects();
  const notes = useClassNotes();
  const today = toDateStr();
  const [date, setDate] = useState(today);
  const [view, setView] = useState<"week" | "calendar">("week");

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
            subId: p.subId,
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

  // For the trip calculator: each subject's standing, and the classes a given
  // working day holds, keyed by the stat subject-id.
  const standings = useMemo(
    () =>
      (data?.stats ?? []).map((st) => ({
        id: st.subject.id,
        name: st.subject.name,
        color: st.subject.color,
        present: st.counts.present,
        total: st.counts.present + st.counts.absent,
      })),
    [data],
  );
  const classesByDate = useCallback(
    (d: string): string[] => {
      if (camu)
        return camuClassesOn(camu, d)
          .map((p) => {
            const sub = subjectOf(p, camu.subjects ?? []);
            return sub ? `camu:${sub.id}` : null;
          })
          .filter((x): x is string => x !== null);
      const wd = weekdayOf(d);
      return (slots ?? []).filter((s) => s.weekday === wd && appliesOn(s, d)).map((s) => s.subjectId);
    },
    [camu, slots],
  );

  if (!profile || (native && !data)) return <TodaySkeleton />;

  const hasManual = (slots?.length ?? 0) > 0;

  return (
    <div className="page-wash stagger min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <PageHeader title="Timetable" />

      <Segmented
        value={view}
        onChange={setView}
        options={[
          ["week", "Week"],
          ["calendar", "Calendar"],
        ]}
        label="Timetable view"
        className="mx-5 mt-1 mb-2"
      />

      {view === "calendar" ? (
        <div className="mt-4 space-y-6">
          <HolidayCalendar
            classCountOn={(d) => (camu ? camuClassesOn(camu, d).length : (slots ?? []).filter((s) => s.weekday === weekdayOf(d) && appliesOn(s, d)).length)}
          />
          <BunkCalculator subjects={standings} target={target} classesByDate={classesByDate} />
        </div>
      ) : (
      <>
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
          className="btn-paper lip-sm grid size-10 place-items-center rounded-full"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="font-display text-[15px] font-semibold tnum">
          {rangeLabel(week[0], week[6])}
        </p>
        <button
          aria-label="Next week"
          onClick={() => setDate(addDays(weekStart, 7))}
          className="btn-paper lip-sm grid size-10 place-items-center rounded-full"
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
                "lip-sm flex flex-col items-center gap-1 rounded-2xl py-2.5",
                on ? "btn-leather" : "btn-paper",
              )}
            >
              <span className={cx("text-[11px] font-medium", on ? "text-on-ink/80" : "text-muted")}>
                {WEEKDAYS_SHORT[weekdayOf(d)]}
              </span>
              <span className="font-display text-[16px] font-extrabold tnum">{Number(d.split("-")[2])}</span>
              {d === today && (
                <span className={cx("size-1 rounded-full", on ? "bg-orange" : "bg-accent")} />
              )}
            </button>
          );
        })}
      </div>

      {/* Day heading */}
      <div className="mt-6 flex items-baseline justify-between px-5">
        <h2 className="font-display text-[19px] font-extrabold tracking-[-0.02em]">{fullDay(date)}</h2>
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
                        "stamp shrink-0",
                        r.status === "present" ? "text-safe" : "text-danger",
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
                {camu && !r.status && r.subId && isPast(date, r.to, today) && (
                  <UnmarkedControl
                    k={classKey(date, r.from, r.subId)}
                    note={notes?.get(classKey(date, r.from, r.subId))}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      </>
      )}
    </div>
  );
}

/** A class is in the past if its day is gone, or it is today and the end time has passed. */
function isPast(date: string, to: string, today: string): boolean {
  if (date < today) return true;
  if (date > today) return false;
  return to <= nowHM();
}

/**
 * When the teacher hasn't marked a class, say what happened: the class was
 * cancelled, or the teacher just hasn't submitted yet. Camu's real mark, when
 * it comes, replaces this on its own.
 */
function UnmarkedControl({ k, note }: { k: string; note?: "cancelled" | "pending" }) {
  const toast = useToast();
  async function set(status: "cancelled" | "pending" | null) {
    await setClassNote(k, status);
    if (status) toast.show(status === "cancelled" ? "Marked cancelled" : "Noted — teacher yet to mark");
  }
  if (note)
    return (
      <div className="mt-2 flex items-center gap-2">
        <span
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold",
            note === "cancelled" ? "bg-surface-2 text-muted" : "bg-warn-soft text-warn",
          )}
        >
          {note === "cancelled" ? <Ban size={13} /> : <Clock3 size={13} />}
          {note === "cancelled" ? "Class cancelled" : "Teacher yet to mark"}
        </span>
        <button onClick={() => void set(null)} aria-label="Clear" className="grid size-6 place-items-center rounded-full text-muted">
          <X size={13} />
        </button>
      </div>
    );
  return (
    <div className="mt-2">
      <p className="mb-1.5 text-[12px] font-semibold text-muted">Teacher hasn&apos;t marked this — what happened?</p>
      <div className="flex gap-2">
        <button onClick={() => void set("cancelled")} className="btn-paper lip-sm inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px]">
          <Ban size={13} /> Cancelled
        </button>
        <button onClick={() => void set("pending")} className="btn-paper lip-sm inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px]">
          <Clock3 size={13} /> Will mark later
        </button>
      </div>
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
