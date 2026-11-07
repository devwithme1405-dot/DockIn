"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ViewSession } from "@/lib/college";
import type { CamuHoliday } from "@/lib/native";
import type { Subject } from "@/lib/types";
import { fmtDay, fmtTime, fromDateStr, toDateStr } from "@/lib/dates";
import { cx } from "./ui";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WD = ["M", "T", "W", "T", "F", "S", "S"];

/** present | absent only — the two things a class in the log can be. */
type Marked = ViewSession & { status: "present" | "absent" };

function marked(sessions: ViewSession[]): Marked[] {
  return sessions.filter((s): s is Marked => s.status === "present" || s.status === "absent");
}

/** The three ways DockIn shows attendance now that Camu feeds it. */
export function AttendanceViewSwitch({
  view,
  onChange,
}: {
  view: "subjects" | "log" | "calendar";
  onChange: (v: "subjects" | "log" | "calendar") => void;
}) {
  const tabs: [typeof view, string][] = [
    ["subjects", "Subjects"],
    ["log", "Log"],
    ["calendar", "Calendar"],
  ];
  return (
    <div className="mx-5 mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={view === id}
          onClick={() => onChange(id)}
          className={cx(
            "h-9 rounded-xl text-[13.5px] font-medium transition",
            view === id ? "bg-surface text-text shadow-[0_0_0_1px_var(--line)]" : "text-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Camu's own "Log", rebuilt: every class across every subject, filtered by
 * what the teacher marked. This is where a lab or a morning class a teacher
 * submits late finally shows up — the timetable does not, the log does.
 */
export function AttendanceLog({
  sessions,
  subjects,
}: {
  sessions: ViewSession[];
  subjects: Subject[];
}) {
  const [show, setShow] = useState<"absent" | "present" | "both">("both");
  const [subId, setSubId] = useState<string>("all");
  const names = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const rows = useMemo(() => {
    const list = marked(sessions)
      .filter((s) => show === "both" || s.status === show)
      .filter((s) => subId === "all" || s.subjectId === subId)
      .sort((a, b) => (a.date === b.date ? b.start.localeCompare(a.start) : b.date.localeCompare(a.date)));
    const out: { month: string; items: Marked[] }[] = [];
    for (const s of list) {
      const [y, m] = s.date.split("-").map(Number);
      const month = `${MONTHS[m - 1]} ${y}`;
      const last = out[out.length - 1];
      if (last && last.month === month) last.items.push(s);
      else out.push({ month, items: [s] });
    }
    return out;
  }, [sessions, show, subId]);

  const total = rows.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="mt-4 px-5 pb-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Show">
        {(["absent", "present", "both"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={show === v}
            onClick={() => setShow(v)}
            className={cx(
              "h-9 rounded-lg text-[13px] font-medium capitalize transition",
              show === v
                ? v === "absent"
                  ? "bg-danger text-white"
                  : v === "present"
                    ? "bg-safe text-white"
                    : "bg-text text-bg"
                : "text-muted",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <select
        value={subId}
        onChange={(e) => setSubId(e.target.value)}
        aria-label="Subject"
        className="mt-3 h-11 w-full rounded-xl border border-line bg-surface px-3 text-[14.5px] text-text outline-none focus:border-accent"
      >
        <option value="all">All subjects</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code ? `${s.code} — ${s.name}` : s.name}
          </option>
        ))}
      </select>

      {total === 0 ? (
        <p className="py-10 text-center text-[13.5px] text-muted">
          {marked(sessions).length === 0
            ? "Camu has not sent your class list yet. Pull to refresh in a moment."
            : `No ${show === "both" ? "" : show} classes to show.`}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.map((g) => (
            <section key={g.month}>
              <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">{g.month}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                {g.items.map((s) => {
                  const sub = names.get(s.subjectId);
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span
                        className={cx(
                          "grid size-7 shrink-0 place-items-center rounded-full",
                          s.status === "present" ? "bg-safe-soft text-safe" : "bg-danger-soft text-danger",
                        )}
                        aria-hidden
                      >
                        {s.status === "present" ? (
                          <Check size={15} strokeWidth={2.75} />
                        ) : (
                          <X size={15} strokeWidth={2.75} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium [overflow-wrap:anywhere]">
                          {sub?.name ?? "Class"}
                        </span>
                        <span className="block text-[12.5px] text-muted">
                          {fmtDay(s.date)}
                          {s.start ? ` · ${fmtTime(s.start)}` : ""}
                        </span>
                      </span>
                      <span
                        className={cx(
                          "text-[13px] font-medium",
                          s.status === "present" ? "text-safe" : "text-danger",
                        )}
                      >
                        {s.status === "present" ? "Present" : "Absent"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

type DayInfo = { present: number; absent: number; items: Marked[] };

/**
 * A month calendar of attendance, so the whole semester Camu holds can be
 * looked back over: a green day was all present, a red day had an absence,
 * a holiday is dimmed. Tap a day to see each class.
 */
export function AttendanceCalendar({
  sessions,
  subjects,
  holidays,
}: {
  sessions: ViewSession[];
  subjects: Subject[];
  holidays: CamuHoliday[];
}) {
  const names = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const byDay = useMemo(() => {
    const m = new Map<string, DayInfo>();
    for (const s of marked(sessions)) {
      const d = m.get(s.date) ?? { present: 0, absent: 0, items: [] };
      if (s.status === "present") d.present += 1;
      else d.absent += 1;
      d.items.push(s);
      m.set(s.date, d);
    }
    return m;
  }, [sessions]);

  const holidaySet = useMemo(() => {
    const set = new Set<string>();
    for (const h of holidays) {
      // Camu's end is exclusive; walk start up to the day before it.
      let d = h.start;
      for (let i = 0; i < 40 && d < (h.end > h.start ? h.end : addOne(h.start)); i++) {
        set.add(d);
        d = addOne(d);
      }
    }
    return set;
  }, [holidays]);

  const today = toDateStr();
  const dates = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const first = dates[0] ?? today;
  const last = dates[dates.length - 1] ?? today;

  const [ym, setYm] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [picked, setPicked] = useState<string | null>(null);

  const minYm = ymOf(first);
  const maxYm = ymOf(last > today ? last : today);
  const cur = ym.y * 12 + ym.m;
  const canPrev = cur > minYm.y * 12 + minYm.m;
  const canNext = cur < maxYm.y * 12 + maxYm.m;

  const cells = useMemo(() => buildMonth(ym.y, ym.m), [ym]);

  const step = (d: number) => {
    const n = ym.m + d;
    setPicked(null);
    setYm({ y: ym.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 });
  };

  const sel = picked ? byDay.get(picked) : null;

  return (
    <div className="mt-4 px-5 pb-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => canPrev && step(-1)}
          disabled={!canPrev}
          aria-label="Previous month"
          className="grid size-9 place-items-center rounded-full bg-surface shadow-[0_0_0_1px_var(--line)] disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-[15px] font-semibold">
          {MONTHS[ym.m]} {ym.y}
        </p>
        <button
          onClick={() => canNext && step(1)}
          disabled={!canNext}
          aria-label="Next month"
          className="grid size-9 place-items-center rounded-full bg-surface shadow-[0_0_0_1px_var(--line)] disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {WD.map((d, i) => (
          <span key={i}>{d}</span>
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
              info={byDay.get(date)}
              holiday={holidaySet.has(date)}
              today={date === today}
              picked={date === picked}
              onPick={() => setPicked(date === picked ? null : date)}
            />
          ),
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
        <Dot className="bg-safe" /> All present
        <Dot className="bg-danger" /> Missed one
        <Dot className="bg-violet" /> Holiday
      </div>

      {picked && (
        <section className="mt-4 rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
          <p className="text-[14px] font-semibold">{fmtDay(picked)}</p>
          {holidaySet.has(picked) && !sel ? (
            <p className="mt-1 text-[13px] text-violet">Holiday — nothing counts.</p>
          ) : !sel ? (
            <p className="mt-1 text-[13px] text-muted">No class marked on this day.</p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {sel.items
                .slice()
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((s) => (
                  <li key={s.id} className="flex items-center gap-3">
                    <span
                      className={cx(
                        "grid size-6 shrink-0 place-items-center rounded-full",
                        s.status === "present" ? "bg-safe-soft text-safe" : "bg-danger-soft text-danger",
                      )}
                      aria-hidden
                    >
                      {s.status === "present" ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {names.get(s.subjectId)?.name ?? "Class"}
                    </span>
                    <span className="text-[12px] text-muted tabular-nums">{s.start ? fmtTime(s.start) : ""}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function DayCell({
  date,
  info,
  holiday,
  today,
  picked,
  onPick,
}: {
  date: string;
  info?: DayInfo;
  holiday: boolean;
  today: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const day = Number(date.split("-")[2]);
  const has = !!info;
  const bad = (info?.absent ?? 0) > 0;
  const tone = has
    ? bad
      ? "bg-danger-soft text-danger"
      : "bg-safe-soft text-safe"
    : holiday
      ? "bg-violet-soft text-violet"
      : "text-text";
  return (
    <button
      onClick={onPick}
      aria-label={`${fmtDay(date)}${info ? `, ${info.present} present, ${info.absent} absent` : ""}`}
      className={cx(
        "relative grid aspect-square place-items-center rounded-xl text-[13px] font-medium transition active:scale-95",
        tone,
        picked && "ring-2 ring-accent",
        today && !picked && "ring-1 ring-line",
      )}
    >
      {day}
      {has && (
        <span
          className={cx("absolute bottom-1 size-1.5 rounded-full", bad ? "bg-danger" : "bg-safe")}
          aria-hidden
        />
      )}
    </button>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={cx("mr-1 inline-block size-2.5 rounded-full align-middle", className)} />;
}

/** A grid of date strings (Monday first), with null for the leading/trailing blanks. */
function buildMonth(y: number, m: number): (string | null)[] {
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(m + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function ymOf(date: string) {
  const [y, m] = date.split("-").map(Number);
  return { y, m: m - 1 };
}

function addOne(date: string): string {
  const d = fromDateStr(date);
  d.setDate(d.getDate() + 1);
  return toDateStr(d);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
