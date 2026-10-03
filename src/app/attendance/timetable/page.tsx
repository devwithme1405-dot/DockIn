"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Copy, Plus, Settings2, Trash2, X } from "lucide-react";
import {
  addSlot,
  addSubject,
  appliesOn,
  deleteSubject,
  getProfile,
  retireSlot,
  reviseSlot,
  saveProfile,
  seedSampleTimetable,
} from "@/lib/repo";
import { useSlots, useSubjects } from "@/lib/hooks";
import {
  DEFAULT_GRID,
  MAX_SPAN,
  inferGrid,
  periodAt,
  periodsOf,
  roomAfter,
  sanitiseGrid,
  spanOf,
  spanTimes,
  type PeriodGrid,
} from "@/lib/periods";
import { WEEKDAYS_LONG, WEEKDAYS_SHORT, fmtTime, toDateStr } from "@/lib/dates";
import type { ClassKind, Slot, Subject } from "@/lib/types";
import {
  Button,
  Chip,
  ConfirmSheet,
  Field,
  Sheet,
  SubjectTile,
  cx,
  inputCls,
  useToast,
} from "@/components/ui";
import { BackHeader } from "@/components/PageHeader";
import { ListSkeleton } from "@/components/Skeleton";

/** Monday first; Sunday is only offered once something is on it. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** "Data Structures" becomes DS, "DBMS" stays DBMS. */
function codeFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

interface Placed {
  slot: Slot;
  subject: Subject | undefined;
  period: number | null;
  span: number;
}

export default function TimetablePage() {
  const subjects = useSubjects();
  const slots = useSlots();
  const profile = useLiveQuery(() => getProfile(), []);
  const toast = useToast();

  const [day, setDay] = useState(() => {
    const d = new Date().getDay();
    return d === 0 || d === 6 ? 1 : d;
  });
  const [sheet, setSheet] = useState<"class" | "grid" | "copy" | null>(null);
  // Adding subjects and laying out the week are two different jobs. Doing both on
  // one screen meant the "add a subject" box disappeared the moment the first one
  // went in, which is exactly when you want to type the next four.
  const [onSubjects, setOnSubjects] = useState(false);
  const [editing, setEditing] = useState<{ slot?: Slot; period: number } | null>(null);
  const [removingSubject, setRemovingSubject] = useState<Subject | null>(null);

  const today = toDateStr();
  const live = useMemo(
    () => (slots ?? []).filter((s) => appliesOn(s, today)),
    [slots, today],
  );

  // Someone who set their week up before this screen existed still sees it laid
  // out correctly: the grid is worked out from their own classes.
  // Work the grid out once for someone who set their week up before this screen
  // existed, then keep it. Re-deriving it on every change let the day drift: add
  // a 9:25 class and the morning period quietly disappeared.
  const pinned = useRef(false);
  useEffect(() => {
    if (pinned.current || profile === undefined || !slots) return;
    pinned.current = true;
    if (profile?.grid) return;
    const usable = slots.filter((x) => !x.deletedAt);
    void saveProfile({ grid: usable.length > 0 ? inferGrid(usable) : DEFAULT_GRID });
  }, [profile, slots]);

  const saved = profile?.grid;
  const grid: PeriodGrid = useMemo(() => {
    if (saved) return sanitiseGrid(saved);
    if (live.length > 0) return inferGrid(live);
    return DEFAULT_GRID;
  }, [saved, live]);
  const periods = useMemo(() => periodsOf(grid), [grid]);

  const byId = useMemo(() => new Map((subjects ?? []).map((s) => [s.id, s])), [subjects]);

  const placed: Placed[] = useMemo(
    () =>
      live
        .filter((s) => s.weekday === day)
        .map((slot) => ({
          slot,
          subject: byId.get(slot.subjectId),
          period: periodAt(grid, slot.start),
          span: spanOf(grid, slot.start, slot.end),
        }))
        .sort((a, b) => a.slot.start.localeCompare(b.slot.start)),
    [live, day, byId, grid],
  );

  /** period number -> what sits there, including the periods a lab covers. */
  const occupied = useMemo(() => {
    const m = new Map<number, Placed>();
    for (const p of placed) {
      if (p.period === null) continue;
      for (let i = 0; i < p.span; i++) m.set(p.period + i, p);
    }
    return m;
  }, [placed]);

  const offGrid = placed.filter((p) => p.period === null);
  const daysWithClasses = WEEK.filter((d) => live.some((s) => s.weekday === d));

  if (!subjects || !slots || profile === undefined) {
    return (
      <>
        <BackHeader href="/attendance" backLabel="Attendance" title="Timetable" />
        <ListSkeleton n={5} />
      </>
    );
  }

  async function saveClass(input: {
    subjectId: string;
    kind: ClassKind;
    span: number;
    room: string;
    period: number;
  }) {
    const { start, end } = spanTimes(grid, input.period, input.span);
    if (editing?.slot) {
      await reviseSlot(editing.slot.id, {
        subjectId: input.subjectId,
        kind: input.kind,
        start,
        end,
        room: input.room,
      });
    } else {
      await addSlot({
        subjectId: input.subjectId,
        weekday: day,
        start,
        end,
        kind: input.kind,
        room: input.room,
        from: null,
      });
    }
    setSheet(null);
    setEditing(null);
  }

  async function removeClass() {
    if (!editing?.slot) return;
    await retireSlot(editing.slot.id);
    setSheet(null);
    setEditing(null);
    toast.show("Class removed");
  }

  async function copyDay(from: number) {
    const source = live.filter((s) => s.weekday === from);
    for (const s of live.filter((x) => x.weekday === day)) await retireSlot(s.id);
    for (const s of source) {
      await addSlot({
        subjectId: s.subjectId,
        weekday: day,
        start: s.start,
        end: s.end,
        kind: s.kind,
        room: s.room,
        from: null,
      });
    }
    setSheet(null);
    toast.show(`Copied ${WEEKDAYS_LONG[from]}`);
  }

  const empty = subjects.length === 0;
  const showSubjects = empty || onSubjects;

  return (
    <>
      <BackHeader
        href="/attendance"
        backLabel="Attendance"
        title="Timetable"
        right={
          !showSubjects && (
            <button
              onClick={() => setSheet("grid")}
              aria-label="Class timings"
              className="grid size-10 place-items-center rounded-full text-muted"
            >
              <Settings2 size={19} />
            </button>
          )
        }
      />

      {showSubjects ? (
        <div className="px-5">
          <p className="text-[15px] text-muted">
            {live.length === 0
              ? "Add every subject you have this semester. Next you will tap the periods each one runs in."
              : "Add or remove a subject. Removing one takes its classes with it."}
          </p>

          <div className="mt-5">
            <SubjectAdder onAdded={() => setOnSubjects(true)} />
          </div>

          {subjects.length > 0 && (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
              {subjects.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <SubjectTile name={s.name} code={s.code} color={s.color} size={36} />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{s.name}</span>
                  <button
                    onClick={() => setRemovingSubject(s)}
                    aria-label={`Remove ${s.name}`}
                    className="grid size-9 place-items-center rounded-full text-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button className="mt-5 w-full" disabled={empty} onClick={() => setOnSubjects(false)}>
            {live.length === 0 ? "Next: lay out the week" : "Done"}
          </Button>

          {live.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-line p-4 text-center">
              <p className="text-[13.5px] text-muted">In a hurry?</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={async () => {
                  await seedSampleTimetable();
                  setOnSubjects(false);
                  toast.show("Sample week added. Edit it to match yours.");
                }}
              >
                Load a sample week
              </Button>
            </div>
          )}
          <div className="h-8" />
        </div>
      ) : (
        <>
          {/* subjects */}
          <section className="px-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Subjects</h2>
              <button onClick={() => setOnSubjects(true)} className="text-[13px] font-medium text-accent">
                Edit
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {subjects.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 pr-3 pl-1.5 text-[13px] font-medium"
                >
                  <span className="size-4 rounded-full" style={{ background: s.color }} />
                  {s.code || s.name}
                </span>
              ))}
            </div>
          </section>

          {/* day picker */}
          <div className="mt-5 flex gap-1.5 overflow-x-auto px-5 pb-1" role="tablist">
            {WEEK.filter((d) => d !== 0 || live.some((s) => s.weekday === 0)).map((d) => {
              const n = live.filter((s) => s.weekday === d).length;
              return (
                <button
                  key={d}
                  role="tab"
                  aria-selected={day === d}
                  onClick={() => setDay(d)}
                  className={cx(
                    "flex h-11 shrink-0 flex-col items-center justify-center rounded-xl px-3.5 text-[13px] font-medium transition",
                    day === d ? "bg-text text-bg" : "bg-surface-2 text-text",
                  )}
                >
                  {WEEKDAYS_SHORT[d]}
                  <span className={cx("text-[10px]", day === d ? "text-bg/70" : "text-muted")}>
                    {n === 0 ? "free" : n}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between px-5">
            <h2 className="text-[15px] font-semibold">{WEEKDAYS_LONG[day]}</h2>
            {daysWithClasses.some((d) => d !== day) && (
              <button
                onClick={() => setSheet("copy")}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent"
              >
                <Copy size={14} /> Copy another day
              </button>
            )}
          </div>

          {/* the day, period by period */}
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)] mx-5">
            {periods.map((p) => {
              const here = occupied.get(p.n);
              const isStart = here && here.period === p.n;
              if (here && !isStart) return null;
              return (
                <li key={p.n}>
                  <button
                    onClick={() => {
                      setEditing({ slot: here?.slot, period: p.n });
                      setSheet("class");
                    }}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                  >
                    <span className="w-9 shrink-0 text-center">
                      <span className="block text-[15px] font-semibold tabular-nums">
                        {here && here.span > 1 ? `${p.n}–${p.n + here.span - 1}` : p.n}
                      </span>
                    </span>
                    {here ? (
                      <>
                        <SubjectTile
                          name={here.subject?.name ?? "?"}
                          code={here.subject?.code ?? ""}
                          color={here.subject?.color ?? "#888"}
                          size={38}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">
                            {here.subject?.name ?? "Deleted subject"}
                          </span>
                          <span className="block text-[12.5px] text-muted">
                            {here.slot.kind === "practical" ? "Lab" : "Lecture"} ·{" "}
                            {fmtTime(here.slot.start)} – {fmtTime(here.slot.end)}
                            {here.slot.room ? ` · ${here.slot.room}` : ""}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                          <Plus size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] text-muted">Free</span>
                          <span className="block text-[12.5px] text-muted/80">{p.label}</span>
                        </span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {offGrid.length > 0 && (
            <section className="mt-5 px-5">
              <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">
                Outside the usual periods
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                {offGrid.map((p) => (
                  <li key={p.slot.id} className="flex items-center gap-3 px-3.5 py-3">
                    <SubjectTile
                      name={p.subject?.name ?? "?"}
                      code={p.subject?.code ?? ""}
                      color={p.subject?.color ?? "#888"}
                      size={38}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{p.subject?.name}</span>
                      <span className="block text-[12.5px] text-muted">
                        {fmtTime(p.slot.start)} – {fmtTime(p.slot.end)}
                      </span>
                    </span>
                    <button
                      onClick={() => void retireSlot(p.slot.id)}
                      aria-label="Remove"
                      className="grid size-9 place-items-center rounded-full text-muted"
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12.5px] text-muted">
                These do not line up with your class timings. Fix the timings above, or remove and add them again.
              </p>
            </section>
          )}

          <div className="h-8" />
        </>
      )}

      {/* ---------- sheets ---------- */}

      <Sheet
        open={sheet === "class"}
        onClose={() => {
          setSheet(null);
          setEditing(null);
        }}
        title={editing?.slot ? "Edit class" : `Period ${editing?.period ?? ""}`}
      >
        {editing && (
          <ClassSheet
            key={`${editing.period}-${editing.slot?.id ?? "new"}`}
            subjects={subjects}
            grid={grid}
            period={editing.period}
            slot={editing.slot}
            onSave={saveClass}
            onRemove={editing.slot ? removeClass : undefined}
          />
        )}
      </Sheet>

      <Sheet open={sheet === "grid"} onClose={() => setSheet(null)} title="Class timings">
        <GridSheet
          grid={grid}
          onSave={async (g) => {
            await saveProfile({ grid: g });
            setSheet(null);
            toast.show("Timings saved");
          }}
        />
      </Sheet>

      <Sheet open={sheet === "copy"} onClose={() => setSheet(null)} title={`Copy into ${WEEKDAYS_LONG[day]}`}>
        <p className="mb-3 text-[14px] text-muted">
          Whatever is on {WEEKDAYS_LONG[day]} now will be replaced.
        </p>
        <ul className="divide-y divide-line">
          {daysWithClasses
            .filter((d) => d !== day)
            .map((d) => (
              <li key={d}>
                <button onClick={() => copyDay(d)} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{WEEKDAYS_LONG[d]}</span>
                    <span className="block text-[12.5px] text-muted">
                      {live.filter((s) => s.weekday === d).length} classes
                    </span>
                  </span>
                  <Copy size={16} className="text-muted" />
                </button>
              </li>
            ))}
        </ul>
      </Sheet>

      <ConfirmSheet
        open={!!removingSubject}
        title={`Remove ${removingSubject?.name ?? ""}?`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removingSubject) await deleteSubject(removingSubject.id);
          setRemovingSubject(null);
          toast.show("Subject removed");
        }}
        onClose={() => setRemovingSubject(null)}
      >
        <p>Its classes go too. Attendance you have already marked stays on record.</p>
      </ConfirmSheet>
    </>
  );
}

/** Type a name, press enter, it is in. */
function SubjectAdder({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  async function add() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    await addSubject({ name: n, code: codeFor(n) });
    setName("");
    setBusy(false);
    onAdded();
    box.current?.focus();
  }

  return (
    <div className="flex gap-2.5">
      <input
        ref={box}
        className={inputCls}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void add()}
        placeholder="Add a subject, e.g. DBMS"
        aria-label="Subject name"
      />
      <Button onClick={add} disabled={!name.trim() || busy} className="shrink-0 px-4">
        <Plus size={18} />
      </Button>
    </div>
  );
}

function ClassSheet({
  subjects,
  grid,
  period,
  slot,
  onSave,
  onRemove,
}: {
  subjects: Subject[];
  grid: PeriodGrid;
  period: number;
  slot?: Slot;
  onSave: (v: { subjectId: string; kind: ClassKind; span: number; room: string; period: number }) => void;
  onRemove?: () => void;
}) {
  const [subjectId, setSubjectId] = useState(slot?.subjectId ?? subjects[0]?.id ?? "");
  const [kind, setKind] = useState<ClassKind>(slot?.kind ?? "lecture");
  const [span, setSpan] = useState(slot ? spanOf(grid, slot.start, slot.end) : 1);
  const [room, setRoom] = useState(slot?.room ?? "");

  const max = roomAfter(grid, period);
  const shown = Math.min(span, max);
  const times = spanTimes(grid, period, shown);

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-muted">Subject</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {subjects.map((s) => (
          <Chip key={s.id} active={subjectId === s.id} onClick={() => setSubjectId(s.id)}>
            {s.code || s.name}
          </Chip>
        ))}
      </div>

      <p className="mb-1.5 text-[13px] font-medium text-muted">Type</p>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {(["lecture", "practical"] as ClassKind[]).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              // A lab almost always runs two periods; a lecture almost always one.
              setSpan(k === "practical" ? Math.min(2, max) : 1);
            }}
            aria-pressed={kind === k}
            className={cx(
              "h-10 rounded-lg text-sm font-medium transition",
              kind === k ? "bg-surface text-text shadow-sm" : "text-muted",
            )}
          >
            {k === "practical" ? "Lab" : "Lecture"}
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-[13px] font-medium text-muted">How many periods</p>
      <div className="mb-2 flex gap-2">
        {Array.from({ length: Math.min(MAX_SPAN, max) }, (_, i) => i + 1).map((n) => (
          <Chip key={n} active={shown === n} onClick={() => setSpan(n)}>
            {n}
          </Chip>
        ))}
      </div>
      <p className="mb-4 text-[13px] text-muted">
        {fmtTime(times.start)} – {fmtTime(times.end)}
      </p>

      <Field label="Room (optional)">
        <input className={inputCls} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="N-204" />
      </Field>

      <Button
        className="w-full"
        onClick={() => onSave({ subjectId, kind, span: shown, room: room.trim(), period })}
        disabled={!subjectId}
      >
        <Check size={17} /> {slot ? "Save" : "Add class"}
      </Button>
      {onRemove && (
        <Button variant="danger" className="mt-2.5 w-full" onClick={onRemove}>
          Remove this class
        </Button>
      )}
    </div>
  );
}

function GridSheet({ grid, onSave }: { grid: PeriodGrid; onSave: (g: PeriodGrid) => void }) {
  const [start, setStart] = useState(grid.start);
  const [length, setLength] = useState(String(grid.length));
  const [gap, setGap] = useState(String(grid.gap));
  const [count, setCount] = useState(String(grid.count));

  const preview = periodsOf(
    sanitiseGrid({ start, length: Number(length), gap: Number(gap), count: Number(count) }),
  );

  return (
    <div>
      <p className="mb-4 text-[14px] text-muted">
        Every college runs a slightly different day. Set it once and the timetable lines up.
      </p>
      <Field label="First class starts at">
        <input className={inputCls} type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Class length (minutes)">
          <input className={inputCls} inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} />
        </Field>
        <Field label="Break between (minutes)">
          <input className={inputCls} inputMode="numeric" value={gap} onChange={(e) => setGap(e.target.value)} />
        </Field>
      </div>
      <Field label="Periods in a day">
        <input className={inputCls} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
      </Field>

      <p className="mb-1.5 text-[13px] font-medium text-muted">Your day</p>
      <div className="mb-5 max-h-40 overflow-y-auto rounded-xl bg-surface-2 p-3 text-[13px] text-muted">
        {preview.map((p) => (
          <p key={p.n} className="tabular-nums">
            {p.n}. {p.label}
          </p>
        ))}
      </div>

      <Button
        className="w-full"
        onClick={() =>
          onSave(sanitiseGrid({ start, length: Number(length), gap: Number(gap), count: Number(count) }))
        }
      >
        Save timings
      </Button>
    </div>
  );
}
