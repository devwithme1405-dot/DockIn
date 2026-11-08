"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, PartyPopper, Sparkles, Trash2 } from "lucide-react";
import { holidaysBetween, nextHolidayAfter } from "@/lib/academic";
import { type ClosureKind, dayClosure, userHolidayOn } from "@/lib/calendar";
import { addDays, toDateStr } from "@/lib/dates";
import { fmtPct } from "@/lib/attendance";
import { deleteEvent } from "@/lib/repo";
import { useEvents } from "@/lib/hooks";
import type { AttendanceState } from "@/lib/types";
import { Sheet, cx, useToast } from "./ui";
import { EventForm } from "./EventForm";
import { InkBar } from "./Paper";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["M", "T", "W", "T", "F", "S", "S"];

const pad = (n: number) => String(n).padStart(2, "0");

/** A grid of date strings (Monday first), null for leading/trailing blanks. */
function buildMonth(y: number, m: number): (string | null)[] {
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(m + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dayLabel(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

/**
 * The holiday calendar: a month at a glance with weekends and the university's
 * festival holidays shaded, today's holiday called out, the next one counted
 * down to, and the fortnight ahead listed. A class on any of these does not
 * count against attendance.
 */
export function HolidayCalendar({ classCountOn }: { classCountOn?: (date: string) => number }) {
  const today = toDateStr();
  const toast = useToast();
  const events = useEvents() ?? [];
  const [ym, setYm] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [picked, setPicked] = useState<string | null>(today);
  const [adding, setAdding] = useState(false);

  const cells = useMemo(() => buildMonth(ym.y, ym.m), [ym]);
  const next = useMemo(() => nextHolidayAfter(today), [today]);
  // Festivals in the next fortnight — weekends are on the grid, not worth listing.
  const fortnight = useMemo(
    () => holidaysBetween(today, addDays(today, 14)).filter((h) => h.kind === "festival"),
    [today],
  );
  const todayHol = dayClosure(events, today);

  const step = (d: number) => {
    const n = ym.m + d;
    setYm({ y: ym.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 });
  };

  const sel = picked ? dayClosure(events, picked) : null;
  const mine = picked ? userHolidayOn(events, picked) : null;
  const selClasses = picked && classCountOn ? classCountOn(picked) : 0;

  return (
    <div className="px-5">
      {/* today / next holiday */}
      <div className="grid grid-cols-2 gap-3">
        <div className={cx("rounded-2xl border-[1.5px] border-dashed px-4 py-3", todayHol ? "border-violet/40 bg-violet-soft" : "border-card-edge")}>
          <p className="text-[12px] font-bold text-muted">Today</p>
          <p className={cx("mt-0.5 text-[15px] font-extrabold", todayHol ? "text-violet" : "")}>
            {todayHol ? todayHol.name : "Working day"}
          </p>
        </div>
        <div className="rounded-2xl border-[1.5px] border-dashed border-card-edge px-4 py-3">
          <p className="text-[12px] font-bold text-muted">Next holiday</p>
          <p className="mt-0.5 truncate text-[15px] font-extrabold text-accent">{next ? next.name : "—"}</p>
          {next && <p className="text-[11.5px] font-semibold text-muted">{inWords(today, next.date)}</p>}
        </div>
      </div>

      {/* the month */}
      <div className="notebook mt-4 px-3 pt-3 pb-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <button onClick={() => step(-1)} aria-label="Previous month" className="btn-paper lip-sm grid size-9 place-items-center rounded-full">
            <ChevronLeft size={18} />
          </button>
          <p className="font-display text-[16px] font-extrabold">
            {MONTHS[ym.m]} {ym.y}
          </p>
          <button onClick={() => step(1)} aria-label="Next month" className="btn-paper lip-sm grid size-9 place-items-center rounded-full">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted">
          {WD.map((d, i) => (
            <span key={i} className={cx(i >= 5 && "text-violet")}>
              {d}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((date, i) =>
            date === null ? (
              <span key={i} />
            ) : (
              <DayCell
                key={date}
                date={date}
                info={dayClosure(events, date)}
                today={date === today}
                picked={date === picked}
                onPick={() => setPicked(date)}
              />
            ),
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] font-semibold text-muted">
        <Dot className="bg-violet" /> Festival holiday
        <Dot className="bg-violet/45" /> Weekend
      </div>

      {/* the picked day */}
      {picked && (
        <div className="lift mt-4 rounded-2xl px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14.5px] font-extrabold">{dayLabel(picked)}</p>
              {sel ? (
                <p className={cx("mt-1 flex items-center gap-1.5 text-[13.5px] font-bold", sel.kind === "weekend" ? "text-muted" : "text-violet")}>
                  <PartyPopper size={15} /> {sel.name}
                  {sel.kind === "custom" ? " · your holiday" : " · holiday, nothing counts"}
                </p>
              ) : (
                <p className="mt-1 text-[13.5px] text-muted">
                  Working day{classCountOn ? ` · ${selClasses} ${selClasses === 1 ? "class" : "classes"}` : ""}
                </p>
              )}
            </div>
            {/* Mark a working day off, or take back one you added. Festivals and
                weekends come from the calendar and can't be removed here. */}
            {mine ? (
              <button
                onClick={async () => {
                  await deleteEvent(mine.id);
                  toast.show("Holiday removed");
                }}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12.5px] font-semibold text-danger"
              >
                <Trash2 size={14} /> Remove
              </button>
            ) : !sel ? (
              <button
                onClick={() => setAdding(true)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-violet-soft px-3 text-[12.5px] font-semibold text-violet"
              >
                <CalendarPlus size={14} /> Holiday
              </button>
            ) : null}
          </div>
        </div>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add holiday">
        <EventForm defaultDate={picked ?? today} onDone={() => setAdding(false)} />
      </Sheet>

      {/* the fortnight ahead */}
      <div className="mt-6">
        <h3 className="mb-2.5 text-[12px] font-extrabold tracking-[0.08em] text-muted uppercase">Next two weeks</h3>
        {fortnight.length === 0 ? (
          <p className="rounded-2xl border-[1.5px] border-dashed border-card-edge px-4 py-4 text-center text-[13.5px] text-muted">
            No holidays in the next fortnight.
          </p>
        ) : (
          <ul className="lift overflow-hidden rounded-2xl">
            {fortnight.map((h) => (
              <li key={h.date} className="ruled-row flex items-center gap-3 px-4 py-3">
                <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", h.kind === "festival" ? "bg-violet-soft text-violet" : "bg-surface-2 text-muted")}>
                  <PartyPopper size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{h.name}</span>
                  <span className="block text-[12px] text-muted">{dayLabel(h.date)}</span>
                </span>
                <span className="shrink-0 text-[12px] font-bold text-muted">{inWords(today, h.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function inWords(from: string, to: string): string {
  const days = Math.round((new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  const w = Math.round(days / 7);
  return `in ${w} ${w === 1 ? "week" : "weeks"}`;
}

function DayCell({
  date,
  info,
  today,
  picked,
  onPick,
}: {
  date: string;
  info: { name: string; kind: ClosureKind } | null;
  today: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const day = Number(date.split("-")[2]);
  const dot = info && info.kind !== "weekend"; // festivals and your own holidays carry a mark
  const tone = info ? (info.kind === "weekend" ? "bg-violet/10 text-violet/80" : "bg-violet-soft text-violet font-extrabold") : "text-text";
  return (
    <button
      onClick={onPick}
      aria-label={`${dayLabel(date)}${info ? `, ${info.name}` : ""}`}
      className={cx(
        "relative grid aspect-square place-items-center rounded-xl text-[13px] font-bold transition active:scale-95",
        tone,
        picked && "ring-2 ring-accent",
        today && !picked && "ring-[1.5px] ring-card-edge",
      )}
    >
      {day}
      {dot && <span className="absolute bottom-1 size-1.5 rounded-full bg-violet" aria-hidden />}
    </button>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={cx("mr-1 inline-block size-2.5 rounded-full align-middle", className)} />;
}

/** One subject's standing and how a trip would change it. */
export interface SubjectStanding {
  id: string;
  name: string;
  color: string;
  present: number;
  total: number;
}

/**
 * The trip calculator: say when you will be away, and it counts the classes that
 * actually fall in those days — skipping Saturdays, Sundays and festival
 * holidays, because the college is closed and nothing is cut then — and shows
 * what your attendance becomes, overall and subject by subject.
 */
export function BunkCalculator({
  subjects,
  target,
  classesByDate,
  closedOn,
  projectsFrom = null,
  semEnd,
}: {
  subjects: SubjectStanding[];
  target: number;
  /** Stat subject-ids that have a class on a (working) date, already projected to semEnd. */
  classesByDate: (date: string) => string[];
  /** Whether the college is closed on a date (weekend, festival, or a holiday you added). */
  closedOn: (date: string) => { name: string; kind: ClosureKind } | null;
  /** The last date Camu has really published; class days after this are a guess. Null = no guessing. */
  projectsFrom?: string | null;
  /** The last teaching day — nothing past it is counted. */
  semEnd: string;
}) {
  const today = toDateStr();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const haveData = subjects.some((s) => s.total > 0);

  const plan = useMemo(() => {
    const lo = from <= to ? from : to;
    const hi = from <= to ? to : from;
    const skip = new Map<string, number>();
    const holidays: { date: string; name: string; kind: ClosureKind }[] = [];
    let classDays = 0;
    let totalSkip = 0;
    let guessedDays = 0;
    let pastSemEnd = false;
    for (let d = lo, i = 0; d <= hi && i < 200; d = addDays(d, 1), i++) {
      if (d > semEnd) {
        pastSemEnd = true;
        break; // exams have begun; nothing past the last teaching day counts
      }
      const h = closedOn(d);
      if (h) {
        holidays.push({ date: d, ...h });
        continue;
      }
      const ids = classesByDate(d);
      if (ids.length) {
        classDays += 1;
        if (projectsFrom && d > projectsFrom) guessedDays += 1;
      }
      for (const id of ids) {
        skip.set(id, (skip.get(id) ?? 0) + 1);
        totalSkip += 1;
      }
    }
    return { skip, holidays, classDays, totalSkip, guessedDays, pastSemEnd, days: dayCount(lo, hi) };
  }, [from, to, classesByDate, closedOn, projectsFrom, semEnd]);

  const totals = subjects.reduce((a, s) => ({ present: a.present + s.present, total: a.total + s.total }), { present: 0, total: 0 });
  const beforePct = totals.total ? (totals.present / totals.total) * 100 : null;
  const afterTotal = totals.total + plan.totalSkip;
  const afterPct = afterTotal ? (totals.present / afterTotal) * 100 : null;
  const afterState: AttendanceState = afterPct === null ? "none" : afterPct + 1e-9 < target ? "danger" : afterPct - target < 3 ? "warn" : "safe";
  const safe = afterPct === null || afterPct + 1e-9 >= target;

  const festivalHols = plan.holidays.filter((h) => h.kind !== "weekend");
  const weekendCount = plan.holidays.filter((h) => h.kind === "weekend").length;

  return (
    <div className="mx-5">
      <div className="notebook px-5 pb-5">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h3 className="font-display text-[16px] font-extrabold">Trip calculator</h3>
        </div>
        <p className="mt-1 text-[13px] text-muted">Going away? See what your attendance becomes.</p>

        {/* when */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-muted">From</span>
            <input
              type="date"
              value={from}
              min={today}
              onChange={(e) => setFrom(e.target.value || today)}
              className="h-11 w-full rounded-xl border-[1.5px] border-card-edge bg-card px-3 text-[14.5px] font-semibold text-text outline-none focus:border-accent"
              aria-label="Trip start"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-muted">To</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value || from)}
              className="h-11 w-full rounded-xl border-[1.5px] border-card-edge bg-card px-3 text-[14.5px] font-semibold text-text outline-none focus:border-accent"
              aria-label="Trip end"
            />
          </label>
        </div>

        {!haveData ? (
          <p className="mt-4 rounded-2xl border-[1.5px] border-dashed border-card-edge px-4 py-5 text-center text-[13px] text-muted">
            Mark a few classes first and this works out how much a trip would cost you.
          </p>
        ) : (
          <>
            {/* holidays in the range don't cost attendance */}
            {(festivalHols.length > 0 || weekendCount > 0) && (
              <div className="mt-4 flex items-start gap-2.5 rounded-2xl border-[1.5px] border-dashed border-violet/40 bg-violet-soft px-3.5 py-3">
                <PartyPopper size={17} className="mt-0.5 shrink-0 text-violet" />
                <p className="text-[12.5px] leading-snug text-violet">
                  {weekendCount > 0 && <b>{weekendCount} weekend {weekendCount === 1 ? "day" : "days"}</b>}
                  {weekendCount > 0 && festivalHols.length > 0 && " and "}
                  {festivalHols.length > 0 && <b>{festivalHols.map((h) => h.name).join(", ")}</b>}
                  {" "}fall in this range — college is closed, so no attendance is cut there.
                </p>
              </div>
            )}

            {/* when Camu hasn't posted that far, the usual week stands in — so say so */}
            {plan.guessedDays > 0 && (
              <div className="mt-3 flex items-start gap-2.5 rounded-2xl border-[1.5px] border-dashed border-card-edge px-3.5 py-3">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-muted" />
                <p className="text-[12.5px] leading-snug text-muted">
                  Camu hasn&apos;t posted the timetable past {fmtTripDay(projectsFrom!)} yet, so{" "}
                  {plan.guessedDays} {plan.guessedDays === 1 ? "day is" : "days are"} counted from your usual
                  weekly timetable. This is an estimate — the real total can be a little more or less.
                </p>
              </div>
            )}

            {plan.pastSemEnd && (
              <p className="mt-3 text-[12px] text-muted">
                Only counted up to the last teaching day ({fmtTripDay(semEnd)}) — exams start after that.
              </p>
            )}

            {/* overall */}
            <div className="mt-4 rounded-2xl bg-surface-2/50 p-4 text-center">
              <p className="text-[12.5px] font-bold text-muted">
                {plan.totalSkip === 0 ? "No classes in these days" : `Skipping ${plan.totalSkip} ${plan.totalSkip === 1 ? "class" : "classes"} over ${plan.classDays} ${plan.classDays === 1 ? "day" : "days"}`}
              </p>
              <p className="mt-1.5 flex items-center justify-center gap-2.5">
                <span className="font-display text-[22px] font-extrabold text-muted tnum">{fmtPct(beforePct)}</span>
                <span className="text-muted">→</span>
                <span className={cx("font-display text-[36px] leading-none font-extrabold tnum", safe ? "text-safe" : "text-danger")}>
                  {fmtPct(afterPct)}
                </span>
              </p>
              <InkBar pct={afterPct} target={target} state={afterState} className="mt-3" />
              <p className={cx("mt-2.5 text-[13px] font-bold", safe ? "text-safe" : "text-danger")}>
                {plan.totalSkip === 0 ? "Nothing changes." : safe ? `Still above your ${target}%.` : `Below your ${target}% — careful.`}
              </p>
            </div>

            {/* subject by subject */}
            {plan.totalSkip > 0 && (
              <ul className="mt-4 space-y-2.5">
                {subjects
                  .filter((s) => (plan.skip.get(s.id) ?? 0) > 0)
                  .map((s) => {
                    const sk = plan.skip.get(s.id) ?? 0;
                    const before = s.total ? (s.present / s.total) * 100 : null;
                    const after = (s.present / (s.total + sk)) * 100;
                    const dropBelow = after + 1e-9 < target;
                    return (
                      <li key={s.id} className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-3 py-2.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{s.name}</span>
                        <span className="shrink-0 text-[12px] font-semibold text-muted tnum">−{sk}</span>
                        <span className="w-[86px] shrink-0 text-right text-[13px] font-extrabold tnum">
                          <span className="text-muted">{fmtPct(before)}</span>
                          <span className="text-muted"> → </span>
                          <span className={dropBelow ? "text-danger" : "text-safe"}>{fmtPct(after)}</span>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "25 Nov" for the trip notes. */
function fmtTripDay(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Inclusive day count between two date strings. */
function dayCount(lo: string, hi: string): number {
  return Math.round((new Date(hi + "T00:00:00").getTime() - new Date(lo + "T00:00:00").getTime()) / 86400000) + 1;
}
