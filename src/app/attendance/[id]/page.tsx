"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronLeft, ChevronRight, Minus, X } from "lucide-react";
import { db } from "@/lib/db";
import { getProfile, setSessionStatus, setSubjectBase } from "@/lib/repo";
import {
  describe,
  fmtPct,
  summarize,
  weeklyTrend,
  withBase,
  type TrendPoint,
} from "@/lib/attendance";
import {
  WEEKDAYS_SHORT,
  fmtDay,
  fmtTime,
  toDateStr,
} from "@/lib/dates";
import type { Session, SessionStatus, Slot } from "@/lib/types";
import {
  Button,
  Chip,
  Field,
  ProgressBar,
  Ring,
  STATE_TEXT,
  Sheet,
  SubjectTile,
  cx,
  inputCls,
  useToast,
} from "@/components/ui";

const STATUS_LABEL: Record<SessionStatus, string> = {
  unmarked: "Not marked",
  present: "Present",
  absent: "Absent",
  cancelled: "Cancelled",
  holiday: "Holiday",
};
const STATUS_STYLE: Record<SessionStatus, string> = {
  unmarked: "bg-surface-2 text-muted",
  present: "bg-safe-soft text-safe",
  absent: "bg-danger-soft text-danger",
  cancelled: "bg-surface-2 text-muted",
  holiday: "bg-accent-soft text-accent",
};

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const profile = useLiveQuery(() => getProfile(), []);
  const subject = useLiveQuery(() => db.subjects.get(id), [id]);
  const slots = useLiveQuery(
    () => db.slots.where("subjectId").equals(id).filter((s) => !s.deletedAt).toArray(),
    [id],
  );
  const sessions = useLiveQuery(
    async () =>
      (await db.sessions.where("subjectId").equals(id).toArray())
        .filter((s) => !s.deletedAt)
        .sort((a, b) => (a.date + a.start < b.date + b.start ? 1 : -1)),
    [id],
  );
  const [tab, setTab] = useState<"overview" | "history">("overview");
  const [editing, setEditing] = useState<Session | null>(null);
  const [baseOpen, setBaseOpen] = useState(false);
  const toast = useToast();

  const target = profile?.target ?? 75;
  const summary = useMemo(
    () => summarize(withBase(sessions ?? [], subject ?? undefined), target),
    [sessions, subject, target],
  );
  const trend = useMemo(
    () => weeklyTrend(sessions ?? [], subject ?? undefined),
    [sessions, subject],
  );

  if (!profile || subject === undefined || sessions === undefined || slots === undefined) return null;
  if (!subject || subject.deletedAt) {
    return (
      <div className="p-5">
        <Link href="/attendance" className="text-accent">
          Back to attendance
        </Link>
        <p className="mt-6 text-muted">This subject no longer exists.</p>
      </div>
    );
  }

  const today = toDateStr();
  const todays = sessions.filter((s) => s.date === today).sort((a, b) => a.start.localeCompare(b.start));
  const cancelled = sessions.filter((s) => s.status === "cancelled").length;
  const absent = summary.total - summary.attended;

  async function change(s: Session, status: SessionStatus) {
    const prev = s.status;
    const next = prev === status ? "unmarked" : status;
    await setSessionStatus(s.id, next);
    setEditing(null);
    toast.show(next === "unmarked" ? "Cleared" : "Updated", () => setSessionStatus(s.id, prev));
  }

  const headline =
    summary.state === "none"
      ? "Mark classes to start tracking"
      : summary.state === "danger"
        ? Number.isFinite(summary.mustAttend)
          ? `You need ${summary.mustAttend} more ${summary.mustAttend === 1 ? "class" : "classes"} to reach ${target}%`
          : `Below ${target}%`
        : describe(summary);

  return (
    <>
      <header className="px-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link
          href="/attendance"
          className="inline-flex h-10 items-center gap-1 rounded-full px-2 text-accent"
        >
          <ChevronLeft size={20} />
          Attendance
        </Link>
      </header>

      <div className="flex items-center gap-3 px-5 pt-1 pb-4">
        <SubjectTile name={subject.name} code={subject.code} color={subject.color} size={52} />
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{subject.code || "Subject"}</p>
          <h1 className="text-[21px] font-semibold leading-tight tracking-tight">{subject.name}</h1>
        </div>
      </div>

      <div className="mx-5 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
        {(["overview", "history"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              "h-9 rounded-lg text-sm font-medium capitalize transition",
              tab === t ? "bg-surface text-text shadow-sm" : "text-muted",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-4 space-y-3 px-5">
          <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
            <div className="flex items-center gap-4">
              <Ring pct={summary.pct} state={summary.state} size={116} stroke={10} target={target}>
                <p className={cx("text-[22px] font-semibold tabular-nums", STATE_TEXT[summary.state])}>
                  {fmtPct(summary.pct)}
                </p>
              </Ring>
              <div className="min-w-0">
                <p className="text-[13px] text-muted">Attendance</p>
                <p className={cx("mt-0.5 text-[16px] font-semibold leading-snug", STATE_TEXT[summary.state])}>
                  {headline}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ProgressBar pct={summary.pct} target={target} state={summary.state} />
            </div>
            <dl className="mt-4 grid grid-cols-4 divide-x divide-line border-t border-line pt-3 text-center">
              <Stat label="Present" value={summary.attended} tone="text-safe" />
              <Stat label="Absent" value={absent} tone="text-danger" />
              <Stat label="Cancelled" value={cancelled} tone="text-muted" />
              <Stat label="Total" value={summary.total} tone="text-text" />
            </dl>
          </section>

          <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
            <h2 className="mb-3 text-[15px] font-semibold">Mark today&apos;s class</h2>
            {todays.length === 0 ? (
              <p className="text-sm text-muted">No {subject.code || "class"} today.</p>
            ) : (
              <div className="space-y-4">
                {todays.map((s) => (
                  <div key={s.id}>
                    <p className="mb-2 text-[13px] text-muted tabular-nums">
                      {fmtTime(s.start)} to {fmtTime(s.end)} · {s.kind === "practical" ? "Lab" : "Lecture"}
                    </p>
                    <div className="grid grid-cols-3 gap-2.5">
                      <BigAction label="Present" icon={Check} on="bg-safe text-white" selected={s.status === "present"} onClick={() => change(s, "present")} />
                      <BigAction label="Absent" icon={X} on="bg-danger text-white" selected={s.status === "absent"} onClick={() => change(s, "absent")} />
                      <BigAction label="Cancelled" icon={Minus} on="bg-text text-bg" selected={s.status === "cancelled"} onClick={() => change(s, "cancelled")} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Weekly schedule</h2>
              <Link href="/attendance/timetable" className="text-sm font-medium text-accent">
                Edit
              </Link>
            </div>
            <Schedule slots={slots} />
          </section>

          <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
            <h2 className="text-[15px] font-semibold">Attendance trend</h2>
            <p className="mb-2 text-[13px] text-muted">Running percentage at the end of each week</p>
            <TrendChart points={trend} target={target} />
          </section>

          <section className="flex items-center justify-between rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
            <div>
              <p className="text-[15px] font-semibold">Before DockIn</p>
              <p className="text-[13px] text-muted tabular-nums">
                {subject.baseTotal
                  ? `${subject.baseAttended ?? 0} of ${subject.baseTotal} classes`
                  : "Add classes you already attended this semester"}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setBaseOpen(true)}>
              {subject.baseTotal ? "Edit" : "Add"}
            </Button>
          </section>

          <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Recent classes</h2>
              <button onClick={() => setTab("history")} className="text-sm font-medium text-accent">
                View all
              </button>
            </div>
            <SessionList sessions={sessions.slice(0, 5)} onPick={setEditing} />
          </section>
        </div>
      ) : (
        <div className="mt-4 px-5">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted">
              Classes appear here once their day has been opened on the Today screen.
            </p>
          ) : (
            <div className="rounded-3xl bg-surface px-4 py-1 shadow-[0_0_0_1px_var(--line)]">
              <SessionList sessions={sessions} onPick={setEditing} />
            </div>
          )}
        </div>
      )}

      <BaseSheet
        key={`${subject.id}:${subject.baseAttended ?? 0}:${subject.baseTotal ?? 0}`}
        open={baseOpen}
        onClose={() => setBaseOpen(false)}
        initialAttended={subject.baseAttended ?? 0}
        initialTotal={subject.baseTotal ?? 0}
        onSave={(a, t) => setSubjectBase(subject.id, a, t)}
      />

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${fmtDay(editing.date)} · ${fmtTime(editing.start)}` : ""}
      >
        <div className="flex flex-wrap gap-2 pb-2">
          {(["present", "absent", "cancelled", "holiday", "unmarked"] as SessionStatus[]).map((st) => (
            <Chip key={st} active={editing?.status === st} onClick={() => editing && change(editing, st)}>
              {STATUS_LABEL[st]}
            </Chip>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div>
      <dd className={cx("text-[20px] font-semibold tabular-nums", tone)}>{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}

function BigAction({
  label,
  icon: Icon,
  on,
  selected,
  onClick,
}: {
  label: string;
  icon: typeof Check;
  on: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "flex h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-medium transition active:scale-[0.97]",
        selected ? on : "bg-surface-2 text-text",
      )}
    >
      <Icon size={20} strokeWidth={2.5} />
      {label}
    </button>
  );
}

function Schedule({ slots }: { slots: Slot[] }) {
  if (slots.length === 0) {
    return <p className="text-sm text-muted">No weekly classes yet.</p>;
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = [...slots].sort(
    (a, b) => order.indexOf(a.weekday) - order.indexOf(b.weekday) || a.start.localeCompare(b.start),
  );
  return (
    <ul className="space-y-2">
      {sorted.map((s) => (
        <li key={s.id} className="flex items-center justify-between text-sm">
          <span className="w-12 font-medium">{WEEKDAYS_SHORT[s.weekday]}</span>
          <span className="flex-1 text-muted tabular-nums">
            {fmtTime(s.start)} to {fmtTime(s.end)}
          </span>
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            {s.kind === "practical" ? "Lab" : "Lecture"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SessionList({
  sessions,
  onPick,
}: {
  sessions: Session[];
  onPick: (s: Session) => void;
}) {
  if (sessions.length === 0) {
    return <p className="py-2 text-sm text-muted">Nothing here yet.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {sessions.map((s) => (
        <li key={s.id}>
          <button
            onClick={() => onPick(s)}
            className="flex w-full items-center justify-between gap-3 py-3 text-left"
          >
            <div>
              <p className="font-medium">{fmtDay(s.date)}</p>
              <p className="text-[13px] text-muted tabular-nums">
                {fmtTime(s.start)} · {s.kind === "practical" ? "Lab" : "Lecture"}
              </p>
            </div>
            <span className="flex items-center gap-1.5">
              <span className={cx("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[s.status])}>
                {STATUS_LABEL[s.status]}
              </span>
              <ChevronRight size={16} className="text-muted" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------- trend chart ----------

function fmtWeek(w: string): string {
  const [, m, d] = w.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
}

function TrendChart({ points, target }: { points: TrendPoint[]; target: number }) {
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-6 text-center text-sm text-muted">
        Mark classes across two weeks to see your trend.
      </p>
    );
  }

  const W = 320;
  const H = 150;
  const pad = { l: 34, r: 12, t: 12, b: 24 };
  const minV = Math.min(...points.map((p) => p.pct), target);
  const lo = Math.max(0, Math.floor((minV - 8) / 10) * 10);
  const hi = 100;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.pct).toFixed(1)}`).join(" ");
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const shown = active ?? points.length - 1;
  const sp = points[shown];

  return (
    <div>
      <p className="mb-1 text-[13px] tabular-nums">
        <span className="font-semibold">{fmtPct(sp.pct)}</span>
        <span className="text-muted"> · week of {fmtWeek(sp.week)}</span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={`Attendance trend over ${points.length} weeks, latest ${fmtPct(points[points.length - 1].pct)}`}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
              {t}
            </text>
          </g>
        ))}
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={y(target)}
          y2={y(target)}
          stroke="var(--muted)"
          strokeWidth={1.25}
          strokeDasharray="4 4"
        />
        <text x={W - pad.r} y={y(target) - 5} textAnchor="end" fontSize={10} fill="var(--muted)">
          Target {target}%
        </text>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.week}>
            <circle
              cx={x(i)}
              cy={y(p.pct)}
              r={i === shown ? 5 : 3.5}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
            <circle
              cx={x(i)}
              cy={y(p.pct)}
              r={16}
              fill="transparent"
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            />
          </g>
        ))}
        <text x={x(0)} y={H - 6} textAnchor="start" fontSize={10} fill="var(--muted)">
          {fmtWeek(points[0].week)}
        </text>
        <text x={x(points.length - 1)} y={H - 6} textAnchor="end" fontSize={10} fill="var(--muted)">
          {fmtWeek(points[points.length - 1].week)}
        </text>
      </svg>
    </div>
  );
}

// ---------- starting numbers ----------

function BaseSheet({
  open,
  onClose,
  initialAttended,
  initialTotal,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initialAttended: number;
  initialTotal: number;
  onSave: (attended: number, total: number) => Promise<void>;
}) {
  const [attended, setAttended] = useState(String(initialAttended || ""));
  const [total, setTotal] = useState(String(initialTotal || ""));
  const a = Number(attended || 0);
  const t = Number(total || 0);
  const valid = Number.isInteger(a) && Number.isInteger(t) && a >= 0 && t >= 0 && a <= t;

  return (
    <Sheet open={open} onClose={onClose} title="Classes before DockIn">
      <p className="mb-4 text-sm text-muted">
        Check your college portal and enter the totals so far this semester. DockIn adds every class
        you mark from now on.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Attended">
          <input
            className={inputCls}
            inputMode="numeric"
            value={attended}
            onChange={(e) => setAttended(e.target.value.replace(/\D/g, ""))}
            placeholder="18"
          />
        </Field>
        <Field label="Total held">
          <input
            className={inputCls}
            inputMode="numeric"
            value={total}
            onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))}
            placeholder="22"
          />
        </Field>
      </div>
      {!valid && <p className="mb-3 text-sm text-danger">Attended cannot be more than total held.</p>}
      <Button
        className="w-full"
        disabled={!valid}
        onClick={async () => {
          await onSave(a, t);
          onClose();
        }}
      >
        Save
      </Button>
    </Sheet>
  );
}
