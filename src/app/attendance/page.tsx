"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { StickyBar } from "@/components/PageHeader";
import { AttendanceSkeleton } from "@/components/Skeleton";
import { ArrowLeft, CalendarDays, ChevronRight, PartyPopper, Search, Target, TrendingDown, TrendingUp } from "lucide-react";
import { getProfile, saveProfile } from "@/lib/repo";
import { useEvents, useSessionsOn } from "@/lib/hooks";
import { classesOn, holidayLastDay, holidayOn, useAttendanceData } from "@/lib/college";
import { CamuStatus, ConnectCamu } from "@/components/College";
import { CamuHistorySheet } from "@/components/CamuHistory";
import { AttendanceCalendar, AttendanceLog } from "@/components/AttendanceViews";
import { eventsOn, nextHoliday } from "@/lib/calendar";
import { addDays, toDateStr, fmtDay, daysBetweenDates } from "@/lib/dates";
import { countable, describe, fmtPct, ifYouMiss, weekChange } from "@/lib/attendance";
import type { AttendanceState } from "@/lib/types";
import { Chip, Sheet, cx, useCountUp } from "@/components/ui";
import { BookTile, InkBar, InkRing, Notebook, PaperIconButton, Segmented, SectionTitle, TrendPill } from "@/components/Paper";

type Filter = "all" | "danger" | "warn" | "safe";
type View = "overview" | "subjects" | "history";

const VIEWS = [
  ["overview", "Overview"],
  ["subjects", "Subjects"],
  ["history", "History"],
] as const;

const TONE: Record<AttendanceState, string> = {
  none: "text-muted",
  safe: "text-text",
  warn: "text-warn",
  danger: "text-danger",
};

function overallLine(state: AttendanceState, target: number, mustAttend: number, canMiss: number): string {
  if (state === "none") return "Mark a few classes to begin";
  if (state === "danger")
    return Number.isFinite(mustAttend)
      ? `Attend the next ${mustAttend} ${mustAttend === 1 ? "class" : "classes"} to reach ${target}%`
      : `You are below ${target}%`;
  if (state === "warn") return `Right on the edge of ${target}%`;
  return Number.isFinite(canMiss)
    ? `Above ${target}% — you can miss ${canMiss} more ${canMiss === 1 ? "class" : "classes"}`
    : `Comfortably above ${target}%`;
}

/** Back, the title in the middle, the holiday calendar on the right. */
function Header() {
  return (
    <StickyBar className="px-5 pb-2.5">
      <div className="grid h-12 grid-cols-[44px_1fr_44px] items-center gap-2">
        <PaperIconButton label="Back to Today" href="/">
          <ArrowLeft size={20} strokeWidth={2.4} />
        </PaperIconButton>
        <h1 className="font-display truncate text-center text-[22px] font-extrabold tracking-[-0.03em]">Attendance</h1>
        <PaperIconButton label="Calendar and holidays" href="/calendar">
          <CalendarDays size={19} strokeWidth={2.3} />
        </PaperIconButton>
      </div>
    </StickyBar>
  );
}

function CountPct({ pct, className }: { pct: number | null; className?: string }) {
  const shown = useCountUp(pct ?? 0, 900);
  return <span className={className}>{pct === null ? "--" : `${Math.round(shown)}%`}</span>;
}

export default function AttendancePage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const target = profile?.target ?? 75;
  const { data, camu, native } = useAttendanceData(target);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("overview");
  const [past, setPast] = useState<"log" | "calendar">("log");
  const [targetOpen, setTargetOpen] = useState(false);
  const events = useEvents();
  const today = toDateStr();
  // Attendance already ignores holidays; this is the screen saying so.
  const onHoliday = useMemo(() => {
    const h = camu ? holidayOn(camu, today) : null;
    if (h) return { title: h.title, date: h.start, endDate: holidayLastDay(h) };
    return eventsOn(events ?? [], today).holidays[0] ?? null;
  }, [events, today, camu]);
  const coming = useMemo(() => {
    const next = (camu?.holidays ?? []).filter((h) => h.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (next) return { title: next.title, date: next.start, endDate: holidayLastDay(next) };
    return nextHoliday(events ?? [], today);
  }, [events, today, camu]);
  // The question the record cannot answer: what happens if I skip tomorrow.
  const tomorrow = addDays(today, 1);
  const tomorrowSessions = useSessionsOn(tomorrow);
  const tomorrowCount = camu ? classesOn(camu, tomorrow).length : countable(tomorrowSessions ?? []);

  const counts = useMemo(() => {
    const c = { all: 0, danger: 0, warn: 0, safe: 0 };
    for (const s of data?.stats ?? []) {
      c.all += 1;
      if (s.summary.state === "danger") c.danger += 1;
      else if (s.summary.state === "warn") c.warn += 1;
      else if (s.summary.state === "safe") c.safe += 1;
    }
    return c;
  }, [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.stats ?? [])
      .filter((s) => filter === "all" || s.summary.state === filter)
      .filter((s) => !q || s.subject.name.toLowerCase().includes(q) || s.subject.code.toLowerCase().includes(q));
  }, [data, query, filter]);

  const trend = useMemo(() => (data ? weekChange(data.sessions, data.overall, today) : null), [data, today]);

  if (!profile || !data)
    return (
      <>
        <Header />
        <div className="h-4" />
        <AttendanceSkeleton />
      </>
    );

  const { stats, overall, overallCounts } = data;
  const bunk = tomorrowCount > 0 && overall.state !== "none" ? ifYouMiss(overall.attended, overall.total, tomorrowCount) : null;
  const bunkOrNeed =
    overall.state === "danger"
      ? { label: "To recover", value: Number.isFinite(overall.mustAttend) ? String(overall.mustAttend) : "All", up: true }
      : {
          label: "Can still miss",
          value: overall.state === "none" ? "--" : Number.isFinite(overall.canMiss) ? String(overall.canMiss) : "Any",
          up: false,
        };

  const subjectList =
    stats.length === 0 ? (
      <Notebook rings={false} className="mx-5 px-5 py-7 text-center">
        <p className="font-bold">{camu ? "Fetching from Camu" : "No subjects yet"}</p>
        <p className="mt-1 text-[13.5px] text-muted">
          {camu ? "Your subjects appear here in a moment." : "Add your subjects and weekly classes in the timetable."}
        </p>
        {!camu && (
          <Link href="/attendance/timetable" className="btn-leather mt-4 inline-flex h-11 items-center rounded-2xl px-5 text-[14px]">
            Open timetable
          </Link>
        )}
      </Notebook>
    ) : null;

  return (
    <div className="page-wash stagger">
      <Header />

      <Segmented value={view} onChange={setView} options={VIEWS} label="Attendance view" className="mx-5 mt-2" />

      {camu ? (
        <CamuStatus camu={camu} className="mt-3" />
      ) : native ? (
        <div className="mx-5 mt-4">
          <ConnectCamu />
        </div>
      ) : null}

      {view === "overview" && (
        <>
          <Notebook className="mx-5 mt-8 px-4 pb-4" label="Overall attendance">
            <div className="flex items-center gap-4">
              <InkRing pct={overall.pct} state={overall.state} size={128} target={target}>
                <div>
                  <CountPct pct={overall.pct} className="font-display block text-[28px] leading-none font-extrabold tracking-[-0.04em] tnum" />
                  <span className="mt-1 block text-[11px] font-bold text-muted">overall</span>
                </div>
              </InkRing>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] leading-tight font-extrabold">Overall attendance</p>
                {trend !== null && trend !== 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-muted">
                    <TrendPill delta={trend} /> this week
                  </p>
                )}
                <p className={cx("mt-2 text-[13px] leading-snug font-semibold", overall.state === "safe" ? "text-muted" : TONE[overall.state])}>
                  {overallLine(overall.state, target, overall.mustAttend, overall.canMiss)}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 border-t border-dashed border-card-edge pt-3 text-center">
              <Count label="Present" value={overallCounts.present} tone="text-safe" />
              <Count label="Absent" value={overallCounts.absent} tone="text-danger" />
              {camu ? (
                <Count label="Classes" value={overallCounts.present + overallCounts.absent} tone="text-text" />
              ) : (
                <Count label="Cancelled" value={overallCounts.cancelled} tone="text-muted" />
              )}
            </dl>
          </Notebook>

          <section className="mt-5 grid grid-cols-2 gap-3 px-5">
            <button onClick={() => setTargetOpen(true)} className="btn-paper flex items-center gap-3 rounded-2xl p-3 text-left">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Target size={19} strokeWidth={2.3} />
              </span>
              <span className="min-w-0">
                <span className="block text-[20px] leading-none font-extrabold tnum">{target}%</span>
                <span className="mt-1 block truncate text-[11.5px] font-semibold text-muted">Your target</span>
              </span>
            </button>
            <div className="btn-paper flex items-center gap-3 rounded-2xl p-3">
              <span
                className={cx(
                  "grid size-10 shrink-0 place-items-center rounded-xl",
                  bunkOrNeed.up ? "bg-danger-soft text-danger" : "bg-safe-soft text-safe",
                )}
              >
                {bunkOrNeed.up ? <TrendingUp size={19} strokeWidth={2.3} /> : <TrendingDown size={19} strokeWidth={2.3} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[20px] leading-none font-extrabold tnum">{bunkOrNeed.value}</span>
                <span className="mt-1 block truncate text-[11.5px] font-semibold text-muted">{bunkOrNeed.label}</span>
              </span>
            </div>
          </section>

          {bunk && (
            <p className="mx-5 mt-4 rounded-2xl border-[1.5px] border-dashed border-card-edge px-4 py-3 text-[13.5px] leading-snug">
              Skip {tomorrowCount === 1 ? "tomorrow's class" : `tomorrow's ${tomorrowCount} classes`} and you land at{" "}
              <b className={cx("font-extrabold tnum", bunk.pct >= target ? "text-safe" : "text-warn")}>{fmtPct(bunk.pct)}</b>
              {bunk.pct >= target ? " — still above target." : ` — below your ${target}%.`}
            </p>
          )}

          {(onHoliday || coming) && (
            <Link
              href="/calendar"
              className="mx-5 mt-3 flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-violet/40 bg-violet-soft px-4 py-3 transition active:scale-[0.99]"
            >
              <PartyPopper size={19} className="shrink-0 text-violet" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold text-violet">{onHoliday ? onHoliday.title : coming!.title}</span>
                <span className="block text-[12.5px] text-muted">
                  {onHoliday
                    ? `Holiday today${spanDays(onHoliday) > 1 ? ` · till ${fmtDay(onHoliday.endDate)}` : ""} · nothing counts against you`
                    : `Next holiday · ${fmtDay(coming!.date)}${spanDays(coming!) > 1 ? ` · ${spanDays(coming!)} days` : ""}`}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-violet" />
            </Link>
          )}

          <SectionTitle className="mt-8">Subjects</SectionTitle>
          {subjectList ?? (
            <Notebook rings={false} className="mx-5 overflow-hidden" label="Subjects">
              <ul>
                {stats.map(({ subject, summary }) => (
                  <li key={subject.id} className="ruled-row">
                    <SubjectLink
                      id={subject.id}
                      camu={!!camu}
                      onOpen={setOpen}
                      className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition active:bg-surface-2/60"
                    >
                      <BookTile size={42} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">{subject.name}</span>
                        <span className="mt-2 flex items-center gap-2.5">
                          <InkBar pct={summary.pct} target={target} state={summary.state} className="flex-1" />
                          <span className={cx("w-10 shrink-0 text-right text-[14.5px] font-extrabold tnum", TONE[summary.state])}>
                            {fmtPct(summary.pct)}
                          </span>
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-muted" />
                    </SubjectLink>
                  </li>
                ))}
              </ul>
            </Notebook>
          )}
        </>
      )}

      {view === "subjects" && (
        <>
          <div className="mt-5 px-5">
            <label className="flex h-12 items-center gap-2.5 rounded-2xl border-[1.5px] border-card-edge bg-card px-4 shadow-[inset_0_1px_3px_rgb(var(--shadow-ink)/0.14)] focus-within:border-accent">
              <Search size={18} className="shrink-0 text-muted" />
              <input
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
                placeholder="Search subject"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search subject"
              />
            </label>
            <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pt-0.5 pb-1.5 [scrollbar-width:none]">
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>All {counts.all}</Chip>
              <Chip active={filter === "danger"} onClick={() => setFilter("danger")}>In danger {counts.danger}</Chip>
              <Chip active={filter === "warn"} onClick={() => setFilter("warn")}>On the line {counts.warn}</Chip>
              <Chip active={filter === "safe"} onClick={() => setFilter("safe")}>Safe {counts.safe}</Chip>
            </div>
          </div>

          <div className="mt-4">
            {subjectList ??
              (visible.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted">No subjects match.</p>
              ) : (
                <ul className="space-y-4 px-5">
                  {visible.map(({ subject, summary, counts: c }) => (
                    <li key={subject.id}>
                      <SubjectLink
                        id={subject.id}
                        camu={!!camu}
                        onOpen={setOpen}
                        className={cx(
                          "lift block w-full rounded-2xl p-4 text-left transition active:scale-[0.99]",
                          summary.state === "danger" && "bg-danger-soft!",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <BookTile size={44} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12px] font-semibold text-muted">{subject.code || "Subject"}</span>
                            <span className="line-clamp-2 block leading-snug font-bold [overflow-wrap:anywhere]">{subject.name}</span>
                          </span>
                          <span className={cx("text-[18px] font-extrabold tnum", TONE[summary.state])}>{fmtPct(summary.pct)}</span>
                        </span>
                        <InkBar pct={summary.pct} target={target} state={summary.state} className="mt-3.5" />
                        <span className="mt-3.5 grid grid-cols-3 gap-2 text-center tnum">
                          {(camu
                            ? ([["Present", c.present], ["Absent", c.absent], ["Classes", c.present + c.absent]] as const)
                            : ([["Present", c.present], ["Absent", c.absent], ["Cancelled", c.cancelled]] as const)
                          ).map(([l, v]) => (
                            <span key={l} className="groove block rounded-xl py-1.5">
                              <span className="block text-[15px] font-extrabold">{v}</span>
                              <span className="block text-[11px] font-semibold text-muted">{l}</span>
                            </span>
                          ))}
                        </span>
                        <span className={cx("mt-3 block text-[13px] leading-snug font-bold", summary.state === "safe" ? "text-safe" : TONE[summary.state])}>
                          {describe(summary)}
                        </span>
                      </SubjectLink>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </>
      )}

      {view === "history" && (
        <>
          <Segmented
            small
            value={past}
            onChange={setPast}
            options={[
              ["log", "Log"],
              ["calendar", "Calendar"],
            ]}
            label="History"
            className="mx-auto mt-5 w-[min(100%-2.5rem,18rem)]"
          />
          {past === "log" ? (
            <AttendanceLog sessions={data.sessions} subjects={stats.map((s) => s.subject)} />
          ) : (
            <AttendanceCalendar sessions={data.sessions} subjects={stats.map((s) => s.subject)} holidays={camu?.holidays ?? []} />
          )}
        </>
      )}

      {camu && (
        <CamuHistorySheet
          camu={camu}
          stat={stats.find((x) => x.subject.id === open) ?? null}
          target={target}
          onClose={() => setOpen(null)}
        />
      )}

      <Sheet open={targetOpen} onClose={() => setTargetOpen(false)} title="Target attendance">
        <p className="mb-4 text-sm text-muted">DockIn compares every subject against this number.</p>
        <div className="flex flex-wrap gap-2.5 pb-2">
          {[60, 65, 70, 75, 80, 85, 90].map((t) => (
            <Chip
              key={t}
              active={target === t}
              onClick={async () => {
                await saveProfile({ target: t });
                setTargetOpen(false);
              }}
            >
              {t}%
            </Chip>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/** Days a holiday covers, both ends included. */
function spanDays(h: { date: string; endDate: string }): number {
  return daysBetweenDates(h.date, h.endDate) + 1;
}

/** A subject opens its own page, or Camu's class list when Camu is the source. */
function SubjectLink({
  id,
  camu,
  onOpen,
  className,
  children,
}: {
  id: string;
  camu: boolean;
  onOpen: (id: string) => void;
  className: string;
  children: React.ReactNode;
}) {
  if (camu)
    return (
      <button type="button" onClick={() => onOpen(id)} className={className}>
        {children}
      </button>
    );
  return (
    <Link href={`/attendance/${id}`} className={className}>
      {children}
    </Link>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="[&+&]:border-l [&+&]:border-dashed [&+&]:border-card-edge">
      <dd className={cx("font-display text-[21px] font-extrabold tnum", tone)}>{value}</dd>
      <dt className="text-[11.5px] font-semibold text-muted">{label}</dt>
    </div>
  );
}
