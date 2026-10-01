"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, ChevronRight, Search, Target, TrendingDown, TrendingUp } from "lucide-react";
import { getProfile, saveProfile } from "@/lib/repo";
import { useAttendanceStats } from "@/lib/hooks";
import { describe, fmtPct } from "@/lib/attendance";
import type { AttendanceState } from "@/lib/types";
import {
  Chip,
  EmptyState,
  ProgressBar,
  Ring,
  STATE_TEXT,
  Sheet,
  SubjectTile,
  cx,
} from "@/components/ui";

type Filter = "all" | "danger" | "warn" | "safe";

function overallLine(state: AttendanceState, target: number, mustAttend: number): string {
  if (state === "none") return "Mark a few classes to begin";
  if (state === "danger")
    return Number.isFinite(mustAttend)
      ? `Attend the next ${mustAttend} ${mustAttend === 1 ? "class" : "classes"} to reach ${target}%`
      : `You are below ${target}%`;
  if (state === "warn") return `Right on the edge of ${target}%`;
  return `Good, you are above ${target}%`;
}

export default function AttendancePage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const target = profile?.target ?? 75;
  const data = useAttendanceStats(target);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [targetOpen, setTargetOpen] = useState(false);

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
      .filter(
        (s) =>
          !q ||
          s.subject.name.toLowerCase().includes(q) ||
          s.subject.code.toLowerCase().includes(q),
      );
  }, [data, query, filter]);

  if (!profile || !data) return null;
  const { stats, overall, overallCounts } = data;

  const bunkOrNeed =
    overall.state === "danger"
      ? { label: "To recover", value: Number.isFinite(overall.mustAttend) ? String(overall.mustAttend) : "All", unit: "classes", up: true }
      : { label: "Can still miss", value: overall.state === "none" ? "--" : Number.isFinite(overall.canMiss) ? String(overall.canMiss) : "Any", unit: "classes", up: false };

  return (
    <>
      <header className="flex items-start justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Attendance</h1>
          <p className="text-[13px] text-muted">Track your classes and stay above target</p>
        </div>
        <Link
          href="/attendance/timetable"
          aria-label="Timetable"
          className="grid size-11 place-items-center rounded-full bg-surface text-text shadow-[0_0_0_1px_var(--line)]"
        >
          <CalendarClock size={20} />
        </Link>
      </header>

      <section className="mx-5 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]" aria-label="Overall attendance">
        <div className="flex items-center gap-4">
          <Ring pct={overall.pct} state={overall.state} size={124} stroke={10} target={target}>
            <div>
              <p className={cx("text-[22px] font-semibold leading-none tabular-nums", STATE_TEXT[overall.state])}>
                {fmtPct(overall.pct)}
              </p>
              <p className="mt-1 text-[11px] text-muted">overall</p>
            </div>
          </Ring>
          <div className="min-w-0">
            <p className="text-[13px] text-muted">Overall attendance</p>
            <p className={cx("mt-0.5 text-[17px] font-semibold leading-snug", STATE_TEXT[overall.state])}>
              {overallLine(overall.state, target, overall.mustAttend)}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 divide-x divide-line border-t border-line pt-3 text-center">
          <Count label="Present" value={overallCounts.present} tone="text-safe" />
          <Count label="Absent" value={overallCounts.absent} tone="text-danger" />
          <Count label="Cancelled" value={overallCounts.cancelled} tone="text-muted" />
        </dl>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 px-5">
        <button
          onClick={() => setTargetOpen(true)}
          className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 text-left shadow-[0_0_0_1px_var(--line)] transition active:scale-[0.98]"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
            <Target size={19} />
          </span>
          <span>
            <span className="block text-[20px] font-semibold leading-none tabular-nums">{target}%</span>
            <span className="mt-1 block text-xs text-muted">Target attendance</span>
          </span>
        </button>
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-[0_0_0_1px_var(--line)]">
          <span
            className={cx(
              "grid size-10 place-items-center rounded-xl",
              bunkOrNeed.up ? "bg-danger-soft text-danger" : "bg-safe-soft text-safe",
            )}
          >
            {bunkOrNeed.up ? <TrendingUp size={19} /> : <TrendingDown size={19} />}
          </span>
          <span>
            <span className="block text-[20px] font-semibold leading-none tabular-nums">{bunkOrNeed.value}</span>
            <span className="mt-1 block text-xs text-muted">{bunkOrNeed.label}</span>
          </span>
        </div>
      </section>

      <div className="mt-5 px-5">
        <label className="flex h-12 items-center gap-2.5 rounded-2xl bg-surface px-4 shadow-[0_0_0_1px_var(--line)] focus-within:shadow-[0_0_0_2px_var(--accent)]">
          <Search size={18} className="shrink-0 text-muted" />
          <input
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
            placeholder="Search subject"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search subject"
          />
        </label>
        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All {counts.all}</Chip>
          <Chip active={filter === "danger"} onClick={() => setFilter("danger")}>In danger {counts.danger}</Chip>
          <Chip active={filter === "warn"} onClick={() => setFilter("warn")}>On the line {counts.warn}</Chip>
          <Chip active={filter === "safe"} onClick={() => setFilter("safe")}>Safe {counts.safe}</Chip>
        </div>
      </div>

      <div className="mt-4">
        {stats.length === 0 ? (
          <EmptyState
            title="No subjects yet"
            body="Add your subjects and weekly classes in the timetable."
            action={
              <Link href="/attendance/timetable" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-on-accent">
                Open timetable
              </Link>
            }
          />
        ) : visible.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No subjects match.</p>
        ) : (
          <ul className="space-y-3 px-5">
            {visible.map(({ subject, summary, counts: c }) => (
              <li key={subject.id}>
                <Link
                  href={`/attendance/${subject.id}`}
                  className={cx(
                    "block rounded-2xl p-4 shadow-[0_0_0_1px_var(--line)] transition active:scale-[0.99]",
                    summary.state === "danger" ? "bg-danger-soft" : "bg-surface",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <SubjectTile name={subject.name} code={subject.code} color={subject.color} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">{subject.code || "Subject"}</p>
                      <p className="line-clamp-2 font-medium leading-snug [overflow-wrap:anywhere]">{subject.name}</p>
                    </div>
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-1 text-[15px] font-semibold tabular-nums",
                        summary.state === "danger" && "bg-danger text-white",
                        summary.state === "warn" && "bg-warn-soft text-warn",
                        summary.state === "safe" && "bg-safe-soft text-safe",
                        summary.state === "none" && "bg-surface-2 text-muted",
                      )}
                    >
                      {fmtPct(summary.pct)}
                    </span>
                    <ChevronRight size={18} className="text-muted" />
                  </div>
                  <div className="mt-3.5">
                    <ProgressBar pct={summary.pct} target={target} state={summary.state} />
                  </div>
                  <dl className="mt-3.5 grid grid-cols-3 gap-2 text-center tabular-nums">
                    {([["Present", c.present], ["Absent", c.absent], ["Cancelled", c.cancelled]] as const).map(([l, v]) => (
                      <div key={l} className="rounded-xl bg-bg/60 py-1.5">
                        <dd className="text-[15px] font-semibold text-text">{v}</dd>
                        <dt className="text-[11px] text-muted">{l}</dt>
                      </div>
                    ))}
                  </dl>
                  <p className={cx("mt-3 text-[13px] font-medium leading-snug", STATE_TEXT[summary.state])}>
                    {describe(summary)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={targetOpen} onClose={() => setTargetOpen(false)} title="Target attendance">
        <p className="mb-4 text-sm text-muted">
          DockIn compares every subject against this number.
        </p>
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
    </>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dd className={cx("text-[20px] font-semibold tabular-nums", tone)}>{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
