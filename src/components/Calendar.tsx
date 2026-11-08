"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, PartyPopper, Plus, Sparkles } from "lucide-react";
import { holidayInfo, holidaysBetween, nextHolidayAfter, type HolidayKind } from "@/lib/academic";
import { addDays, toDateStr } from "@/lib/dates";
import { fmtPct } from "@/lib/attendance";
import type { AttendanceState } from "@/lib/types";
import { cx } from "./ui";
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
  const [ym, setYm] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [picked, setPicked] = useState<string | null>(today);

  const cells = useMemo(() => buildMonth(ym.y, ym.m), [ym]);
  const next = useMemo(() => nextHolidayAfter(today), [today]);
  // Festivals in the next fortnight — weekends are on the grid, not worth listing.
  const fortnight = useMemo(
    () => holidaysBetween(today, addDays(today, 14)).filter((h) => h.kind === "festival"),
    [today],
  );
  const todayHol = holidayInfo(today);

  const step = (d: number) => {
    const n = ym.m + d;
    setYm({ y: ym.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 });
  };

  const sel = picked ? holidayInfo(picked) : null;
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
                info={holidayInfo(date)}
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
          <p className="text-[14.5px] font-extrabold">{dayLabel(picked)}</p>
          {sel ? (
            <p className={cx("mt-1 flex items-center gap-1.5 text-[13.5px] font-bold", sel.kind === "festival" ? "text-violet" : "text-muted")}>
              <PartyPopper size={15} /> {sel.name} · holiday, nothing counts
            </p>
          ) : (
            <p className="mt-1 text-[13.5px] text-muted">
              Working day{classCountOn ? ` · ${selClasses} ${selClasses === 1 ? "class" : "classes"}` : ""}
            </p>
          )}
        </div>
      )}

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
  info: { name: string; kind: HolidayKind } | null;
  today: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const day = Number(date.split("-")[2]);
  const tone = info ? (info.kind === "festival" ? "bg-violet-soft text-violet font-extrabold" : "bg-violet/10 text-violet/80") : "text-text";
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
      {info?.kind === "festival" && <span className="absolute bottom-1 size-1.5 rounded-full bg-violet" aria-hidden />}
    </button>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={cx("mr-1 inline-block size-2.5 rounded-full align-middle", className)} />;
}

/**
 * The bunk calculator: start from where attendance stands, add classes you plan
 * to skip, and watch the figure fall — with how far you can go before it drops
 * below target.
 */
export function BunkCalculator({
  attended,
  total,
  target,
  canMiss,
  state,
}: {
  attended: number;
  total: number;
  target: number;
  /** How many more can be missed while staying at target (Infinity for none-set). */
  canMiss: number;
  state: AttendanceState;
}) {
  const [skip, setSkip] = useState(0);
  if (total === 0)
    return (
      <div className="mx-5 rounded-2xl border-[1.5px] border-dashed border-card-edge px-4 py-6 text-center text-[13.5px] text-muted">
        Mark a few classes first and the bunk calculator works out how much you can afford to skip.
      </div>
    );

  const newTotal = total + skip;
  const pct = (attended / newTotal) * 100;
  const safe = pct + 1e-9 >= target;
  const barState: AttendanceState = pct + 1e-9 < target ? "danger" : pct - target < 3 ? "warn" : "safe";
  const maxSafe = Number.isFinite(canMiss) ? canMiss : null;

  return (
    <div className="mx-5">
      <div className="notebook px-5 pb-5">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h3 className="font-display text-[16px] font-extrabold">Bunk calculator</h3>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          You are at <b className="text-text tnum">{fmtPct((attended / total) * 100)}</b> ({attended}/{total}).
        </p>

        <div className="mt-4 flex items-center justify-center gap-5">
          <button
            onClick={() => setSkip((s) => Math.max(0, s - 1))}
            aria-label="One fewer"
            disabled={skip === 0}
            className="btn-paper grid size-12 place-items-center rounded-full disabled:opacity-40"
          >
            <Minus size={20} strokeWidth={2.5} />
          </button>
          <div className="text-center">
            <p className="font-display text-[40px] leading-none font-extrabold tnum">{skip}</p>
            <p className="mt-1 text-[12px] font-bold text-muted">classes to skip</p>
          </div>
          <button
            onClick={() => setSkip((s) => Math.min(60, s + 1))}
            aria-label="One more"
            className="btn-leather grid size-12 place-items-center rounded-full"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-surface-2/50 p-4 text-center">
          <p className="text-[12.5px] font-bold text-muted">Attendance would become</p>
          <p className={cx("font-display mt-0.5 text-[34px] leading-none font-extrabold tnum", safe ? "text-safe" : "text-danger")}>
            {fmtPct(pct)}
          </p>
          <InkBar pct={pct} target={target} state={barState} className="mt-3" />
          <p className={cx("mt-2.5 text-[13px] font-bold", safe ? "text-safe" : "text-danger")}>
            {safe ? `Still above your ${target}%.` : `Below your ${target}% — careful.`}
          </p>
        </div>

        {maxSafe !== null && (
          <p className="mt-3 text-center text-[13px] text-muted">
            {maxSafe > 0 ? (
              <>
                You can skip up to <b className="text-accent tnum">{maxSafe}</b> {maxSafe === 1 ? "class" : "classes"} and stay above target.
              </>
            ) : state === "danger" ? (
              "You are already below target — attend everything you can."
            ) : (
              "No room to bunk right now — the next skip drops you below target."
            )}
          </p>
        )}
      </div>
    </div>
  );
}
