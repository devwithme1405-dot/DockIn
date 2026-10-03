"use client";

import { useState } from "react";
import { BackHeader } from "@/components/PageHeader";
import { ListSkeleton } from "@/components/Skeleton";
import { Plus, Trash2 } from "lucide-react";
import {
  SUBJECT_COLORS,
  addSlot,
  addSubject,
  deleteSlot,
  deleteSubject,
  seedSampleTimetable,
} from "@/lib/repo";
import { useSlots, useSubjects } from "@/lib/hooks";
import { WEEKDAYS_LONG, WEEKDAYS_SHORT, fmtTime } from "@/lib/dates";
import type { ClassKind } from "@/lib/types";
import {
  Button,
  Chip,
  EmptyState,
  Field,
  Sheet,
  cx,
  inputCls,
} from "@/components/ui";

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function TimetablePage() {
  const subjects = useSubjects();
  const slots = useSlots();
  const [subjectSheet, setSubjectSheet] = useState(false);
  const [slotSheet, setSlotSheet] = useState(false);

  if (!subjects || !slots)
    return (
      <>
        <BackHeader href="/attendance" backLabel="Attendance" title="Timetable" />
        <ListSkeleton n={5} />
      </>
    );
  const byId = new Map(subjects.map((s) => [s.id, s]));

  return (
    <>
      <BackHeader href="/attendance" backLabel="Attendance" title="Timetable" />

      {subjects.length === 0 && (
        <div className="mb-6">
          <EmptyState
            title="Start with your subjects"
            body="Add them one by one, or load a sample week and edit it."
            action={
              <Button variant="secondary" size="sm" onClick={() => seedSampleTimetable()}>
                Load sample timetable
              </Button>
            }
          />
        </div>
      )}

      <section className="px-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">Subjects</h2>
          <Button variant="ghost" size="sm" onClick={() => setSubjectSheet(true)}>
            <Plus size={16} /> Add
          </Button>
        </div>
        {subjects.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    {s.code && <p className="text-[13px] text-muted">{s.code}</p>}
                  </div>
                </div>
                <button
                  aria-label={`Delete ${s.name}`}
                  onClick={() => {
                    if (confirm(`Delete ${s.name} and its weekly classes? Marked history stays.`))
                      deleteSubject(s.id);
                  }}
                  className="grid size-9 place-items-center rounded-full text-muted"
                >
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-7 px-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">Weekly classes</h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={subjects.length === 0}
            onClick={() => setSlotSheet(true)}
          >
            <Plus size={16} /> Add class
          </Button>
        </div>
        {ORDER.map((wd) => {
          const day = slots
            .filter((s) => s.weekday === wd && byId.has(s.subjectId))
            .sort((a, b) => a.start.localeCompare(b.start));
          if (day.length === 0) return null;
          return (
            <div key={wd} className="mb-4">
              <h3 className="mb-1.5 text-[13px] font-medium text-muted">{WEEKDAYS_LONG[wd]}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
                {day.map((s) => {
                  const sub = byId.get(s.subjectId)!;
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-9 w-1 shrink-0 rounded-full"
                          style={{ background: sub.color }}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{sub.name}</p>
                          <p className="text-[13px] text-muted tabular-nums">
                            {fmtTime(s.start)} to {fmtTime(s.end)} ·{" "}
                            {s.kind === "practical" ? "Lab" : "Lecture"}
                          </p>
                        </div>
                      </div>
                      <button
                        aria-label="Delete class"
                        onClick={() => deleteSlot(s.id)}
                        className="grid size-9 place-items-center rounded-full text-muted"
                      >
                        <Trash2 size={17} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {slots.length === 0 && subjects.length > 0 && (
          <p className="text-sm text-muted">No weekly classes yet. Tap Add class.</p>
        )}
      </section>

      <SubjectSheet open={subjectSheet} onClose={() => setSubjectSheet(false)} />
      <SlotSheet
        open={slotSheet}
        onClose={() => setSlotSheet(false)}
        subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
      />
    </>
  );
}

function SubjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState(SUBJECT_COLORS[0]);

  async function save() {
    if (!name.trim()) return;
    await addSubject({ name, code, color });
    setName("");
    setCode("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add subject">
      <Field label="Subject name">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Data Structures"
          autoFocus
        />
      </Field>
      <Field label="Short code (optional)">
        <input
          className={inputCls}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="DSA"
        />
      </Field>
      <p className="mb-1.5 text-[13px] font-medium text-muted">Colour</p>
      <div className="mb-5 flex flex-wrap gap-2.5">
        {SUBJECT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            className={cx(
              "size-9 rounded-full ring-offset-2 ring-offset-surface",
              color === c && "ring-2 ring-text",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
      <Button className="w-full" onClick={save} disabled={!name.trim()}>
        Add subject
      </Button>
    </Sheet>
  );
}

function SlotSheet({
  open,
  onClose,
  subjects,
}: {
  open: boolean;
  onClose: () => void;
  subjects: { id: string; name: string }[];
}) {
  const [subjectId, setSubjectId] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState("09:25");
  const [end, setEnd] = useState("10:25");
  const [kind, setKind] = useState<ClassKind>("lecture");

  const chosen = subjectId || subjects[0]?.id || "";
  const valid = !!chosen && start < end;

  async function save() {
    if (!valid) return;
    await addSlot({ subjectId: chosen, weekday, start, end, kind });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add weekly class">
      <Field label="Subject">
        <select
          className={inputCls}
          value={chosen}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="mb-1.5 text-[13px] font-medium text-muted">Day</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {ORDER.map((d) => (
          <Chip key={d} active={weekday === d} onClick={() => setWeekday(d)}>
            {WEEKDAYS_SHORT[d]}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <input
            type="time"
            className={inputCls}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Ends">
          <input
            type="time"
            className={inputCls}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <p className="mb-1.5 text-[13px] font-medium text-muted">Type</p>
      <div className="mb-5 flex gap-2">
        <Chip active={kind === "lecture"} onClick={() => setKind("lecture")}>
          Lecture
        </Chip>
        <Chip active={kind === "practical"} onClick={() => setKind("practical")}>
          Lab / practical
        </Chip>
      </div>
      {start >= end && (
        <p className="mb-3 text-sm text-danger">End time must be after the start time.</p>
      )}
      <Button className="w-full" onClick={save} disabled={!valid}>
        Add class
      </Button>
    </Sheet>
  );
}
