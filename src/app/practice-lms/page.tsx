"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Eye, FileText, FlaskConical, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { db, type PracticeAttempt } from "@/lib/db";
import type { Task } from "@/lib/types";
import {
  addPracticeAssignment,
  dateIn,
  isPracticeTask,
  removePracticeAssignment,
  resetPractice,
  setNextAnswer,
  startPractice,
  stopPractice,
  useNextAnswer,
  usePracticeOn,
  type NextAnswer,
} from "@/lib/practiceLms";
import { assignInstance } from "@/lib/solution";
import { handOver } from "@/components/AssignmentFile";
import { CopyStudio } from "@/components/SolutionStudio";
import { Sheet, cx, useToast } from "@/components/ui";

/** Moodle's own blue, so this reads as "the LMS", not as DockIn. */
const LMS_BLUE = "#0f6cbf";

const ANSWERS: [NextAnswer, string][] = [
  ["ok", "Works"],
  ["fail", "Fails"],
  ["draft", "Stays draft"],
  ["webonly", "Website-only login"],
];

const STATUS: Record<PracticeAttempt["status"], { label: string; cls: string }> = {
  submitted: { label: "Submitted for grading", cls: "bg-[#d7f0dd] text-[#1d6b34]" },
  draft: { label: "Draft (not submitted)", cls: "bg-[#fdebc8] text-[#8a5300]" },
  failed: { label: "Upload failed", cls: "bg-[#fbd9d9] text-[#a12626]" },
  refused: { label: "Refused (website-only login)", cls: "bg-[#fbd9d9] text-[#a12626]" },
};

const stamp = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const kb = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

function dueAt(t: Task): number | null {
  return t.dueDate ? new Date(`${t.dueDate}T${t.dueTime ?? "23:59"}:00`).getTime() : null;
}

function span(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return [d ? `${d} day${d > 1 ? "s" : ""}` : "", h ? `${h} hour${h > 1 ? "s" : ""}` : "", !d && mm ? `${mm} min` : ""].filter(Boolean).join(" ") || "0 min";
}

export default function PracticeLmsPage() {
  const on = usePracticeOn();
  const next = useNextAnswer();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tasks = useLiveQuery(() => db.tasks.filter((t) => isPracticeTask(t.id) && !t.deletedAt).toArray(), []) ?? [];
  const attempts = useLiveQuery(() => db.practiceAttempts.toArray(), []) ?? [];

  const courses = [...new Set(tasks.map((t) => t.notes || "Other"))].sort();
  const latest = (t: Task) => attempts.filter((a) => a.instance === assignInstance(t.id) && (a.status === "submitted" || a.status === "draft")).sort((a, b) => b.at - a.at)[0];
  const open = tasks.find((t) => t.id === openId) ?? null;

  async function toggle() {
    setBusy(true);
    if (on) {
      await stopPractice();
      toast.show("Practice LMS off — its assignments are gone from Tasks");
    } else {
      await startPractice();
      toast.show("Practice LMS on — assignments are in Tasks");
    }
    setBusy(false);
  }

  return (
    <main className="min-h-dvh bg-[#f2f4f7] pb-28 text-[#1d2125] dark:bg-[#15181c] dark:text-[#e6e8eb]">
      <header className="sticky top-0 z-10 text-white shadow-md" style={{ background: LMS_BLUE }}>
        <div className="flex items-center gap-1 px-2 pt-[max(0.4rem,var(--sat))] pb-2">
          <Link href="/settings" aria-label="Back" className="grid size-11 place-items-center rounded-full active:bg-white/15">
            <ChevronLeft size={24} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[17.5px] leading-tight font-bold">Practice LMS</p>
            <p className="text-[12px] opacity-85">Pretend · nothing here reaches the real LMS</p>
          </div>
          <span className="mr-9 rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-extrabold tracking-wider">TEST</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-4 pt-4">
        {/* on / off */}
        <button
          onClick={() => void toggle()}
          disabled={busy}
          aria-pressed={on}
          className="flex w-full items-center gap-3 rounded-xl border border-black/10 bg-white px-3.5 py-3 text-left shadow-sm disabled:opacity-60 dark:border-white/10 dark:bg-[#1f2328]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg text-white" style={{ background: on ? LMS_BLUE : "#8b949e" }}>
            <FlaskConical size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">{on ? "Practice LMS is on" : "Turn on Practice LMS"}</span>
            <span className="block text-[12.5px] opacity-70">{on ? "Its assignments are in your Tasks" : "Adds practice assignments to Tasks"}</span>
          </span>
          <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "" : "bg-black/15 dark:bg-white/20")} style={on ? { background: LMS_BLUE } : undefined}>
            <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-[left]", on ? "left-6" : "left-1")} />
          </span>
        </button>

        {!on ? (
          <ol className="mt-4 space-y-2 rounded-xl bg-white px-4 py-3.5 text-[13.5px] leading-snug shadow-sm dark:bg-[#1f2328]">
            <li><b>1.</b> Turn it on here, on <b>both</b> phones (yours and a friend&apos;s).</li>
            <li><b>2.</b> In a chat, send a Word/PDF → <i>Solution for an LMS assignment</i> → pick a <i>(practice)</i> one.</li>
            <li><b>3.</b> On the other phone: <i>Edit &amp; submit</i> → check → <i>Submit</i>.</li>
            <li><b>4.</b> Come back here: open the assignment to see what was handed in.</li>
          </ol>
        ) : (
          <>
            <div className="mt-4 rounded-xl bg-white px-3.5 py-3 shadow-sm dark:bg-[#1f2328]">
              <p className="text-[12px] font-extrabold tracking-wide uppercase opacity-60">The next submit</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ANSWERS.map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setNextAnswer(id)}
                    aria-pressed={next === id}
                    className={cx("h-9 rounded-full border px-3.5 text-[13px] font-bold transition", next === id ? "border-transparent text-white" : "border-black/15 dark:border-white/20")}
                    style={next === id ? { background: LMS_BLUE } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] opacity-65">{next === "ok" ? "Goes in like a normal submission." : "Only the next one — then it works again."}</p>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-[19px] font-bold">My courses</p>
              <button
                onClick={() => setAdding(true)}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-bold text-white shadow-sm active:scale-[0.98]"
                style={{ background: LMS_BLUE }}
              >
                <Plus size={17} /> Add assignment
              </button>
            </div>

            {courses.map((course) => (
              <section key={course} className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-[#1f2328]">
                <p className="border-b border-black/5 px-4 py-2.5 text-[14.5px] font-bold dark:border-white/10" style={{ color: LMS_BLUE }}>
                  {course}
                </p>
                <ul>
                  {tasks
                    .filter((t) => (t.notes || "Other") === course)
                    .sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))
                    .map((t, i) => {
                      const sub = latest(t);
                      const st = sub ? STATUS[sub.status] : null;
                      return (
                        <li key={t.id} className="anim-pop" style={{ "--d": `${i * 30}ms` } as CSSProperties}>
                          <button onClick={() => setOpenId(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03] dark:active:bg-white/5">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e7f0fa] dark:bg-[#1b3550]" style={{ color: LMS_BLUE }}>
                              <FileText size={17} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14.5px] font-semibold">{t.title}</span>
                              <span className="block text-[12px] opacity-65">{t.dueDate ? `Due ${stamp(dueAt(t)!)}` : "No due date"}</span>
                            </span>
                            <span className={cx("shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold", st ? st.cls : "bg-black/5 dark:bg-white/10")}>
                              {sub?.status === "submitted" ? "Submitted" : sub?.status === "draft" ? "Draft" : "No attempt"}
                            </span>
                            <ChevronRight size={16} className="shrink-0 opacity-40" />
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
            {tasks.length === 0 && <p className="mt-4 rounded-xl bg-white px-4 py-5 text-center text-[13.5px] opacity-70 shadow-sm dark:bg-[#1f2328]">No assignments. Add one.</p>}

            <button
              onClick={async () => {
                await resetPractice();
                toast.show("Practice LMS reset — nothing handed in");
              }}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-[14px] font-bold dark:border-white/10 dark:bg-[#1f2328]"
            >
              <RotateCcw size={16} /> Start over (clear submissions)
            </button>
          </>
        )}
      </div>

      {adding && <AddAssignment courses={courses} onClose={() => setAdding(false)} />}
      {open && <AssignmentView task={open} attempts={attempts.filter((a) => a.instance === assignInstance(open.id))} onClose={() => setOpenId(null)} />}
    </main>
  );
}

function AddAssignment({ courses, onClose }: { courses: string[]; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState(courses[0] ?? "");
  const [date, setDate] = useState(() => dateIn(2));
  const [time, setTime] = useState("23:59");
  const [busy, setBusy] = useState(false);
  const input = "h-12 w-full rounded-xl border border-black/15 bg-white px-3.5 text-[15.5px] outline-none focus:border-[#0f6cbf] dark:border-white/15 dark:bg-[#15181c]";
  return (
    <Sheet open onClose={onClose} title="Add an assignment">
      <label className="block">
        <span className="mb-1 block text-[13px] font-bold">Assignment name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="e.g. CN Assignment 2" autoFocus className={input} />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-[13px] font-bold">Course</span>
        <input value={course} onChange={(e) => setCourse(e.target.value.slice(0, 80))} placeholder="e.g. Computer Networks" list="practice-courses" className={input} />
        <datalist id="practice-courses">
          {courses.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-2">
        <label className="block">
          <span className="mb-1 block text-[13px] font-bold">Due date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-bold">Time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
        </label>
      </div>
      <p className="mt-2 text-[12px] text-muted">It shows up in Tasks like an LMS assignment. Friends with Practice LMS on get it automatically when you send them its solution.</p>
      <button
        disabled={!title.trim() || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await addPracticeAssignment({ title: title.trim(), course: course.trim() || "Practice", dueDate: date || null, dueTime: date ? time || "23:59" : null });
            toast.show("Added — it's in your Tasks now");
            onClose();
          } catch (e) {
            toast.show(e instanceof Error ? e.message : "Could not add it.");
            setBusy(false);
          }
        }}
        className="mt-4 h-12 w-full rounded-xl text-[15.5px] font-bold text-white disabled:opacity-50"
        style={{ background: LMS_BLUE }}
      >
        Add assignment
      </button>
    </Sheet>
  );
}

/** One assignment, laid out like Moodle's assignment page. */
function AssignmentView({ task, attempts, onClose }: { task: Task; attempts: PracticeAttempt[]; onClose: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState<File | null>(null);
  const [confirm, setConfirm] = useState(false);
  const instance = assignInstance(task.id)!;
  const kept = attempts.filter((a) => a.status === "submitted" || a.status === "draft").sort((a, b) => b.at - a.at);
  const last = kept[0];
  const due = dueAt(task);
  const [now] = useState(() => Date.now());
  const history = [...attempts].sort((a, b) => b.at - a.at);

  const timeRow = !due
    ? "No due date"
    : last?.status === "submitted"
      ? last.at <= due
        ? `Submitted ${span(due - last.at)} early`
        : `Submitted ${span(last.at - due)} late`
      : due > now
        ? `${span(due - now)} left`
        : `Overdue by ${span(now - due)}`;

  return (
    <Sheet open onClose={onClose} title={task.title}>
      <p className="-mt-2 mb-3 text-[13px] text-muted">{task.notes}</p>
      <div className="overflow-hidden rounded-xl border border-black/10 text-[13.5px] dark:border-white/10">
        <p className="px-3.5 py-2 text-[14px] font-bold text-white" style={{ background: LMS_BLUE }}>
          Submission status
        </p>
        <Row k="Attempt">{kept.length ? `Attempt ${kept.length}` : "No attempt yet"}</Row>
        <Row k="Submission status">
          <span className={cx("rounded px-1.5 py-0.5 text-[12px] font-bold", last ? STATUS[last.status].cls : "bg-black/5 dark:bg-white/10")}>
            {last ? STATUS[last.status].label : "No attempt"}
          </span>
        </Row>
        <Row k="Grading status">Not graded</Row>
        <Row k="Due date">{due ? stamp(due) : "—"}</Row>
        <Row k="Time remaining">{timeRow}</Row>
        <Row k="Last modified">{last ? stamp(last.at) : "—"}</Row>
        <Row k="File submissions">
          {last ? (
            <button onClick={() => last.blob && void handOver(last.blob, last.name)} className="flex min-w-0 items-center gap-1.5 text-left font-semibold underline-offset-2 hover:underline" style={{ color: LMS_BLUE }}>
              <Eye size={14} className="shrink-0" />
              <span className="truncate">{last.name}</span>
              <span className="shrink-0 font-normal opacity-60">· {kb(last.size)}</span>
            </button>
          ) : (
            "—"
          )}
        </Row>
      </div>

      {history.length > 0 && (
        <>
          <p className="mt-4 mb-1.5 text-[12px] font-extrabold tracking-wide text-muted uppercase">Every try</p>
          <ul className="space-y-1.5">
            {history.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{a.name}</span>
                  <span className="block text-[11.5px] text-muted">
                    {stamp(a.at)} · {kb(a.size)}
                  </span>
                </span>
                <span className={cx("shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold", STATUS[a.status].cls)}>
                  {a.status === "submitted" ? "Submitted" : a.status === "draft" ? "Draft" : a.status === "failed" ? "Failed" : "Refused"}
                </span>
                {a.blob && (
                  <button onClick={() => void handOver(a.blob!, a.name)} aria-label={`Open ${a.name}`} className="grid size-8 shrink-0 place-items-center rounded-full bg-surface">
                    <Eye size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setOwn(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => input.current?.click()}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white"
        style={{ background: LMS_BLUE }}
      >
        <Upload size={17} /> {last ? "Edit submission" : "Add submission"}
      </button>
      {confirm ? (
        <div className="mt-2 flex gap-2">
          <button onClick={() => setConfirm(false)} className="h-11 flex-1 rounded-xl bg-surface-2 text-[14px] font-bold">
            Keep
          </button>
          <button
            onClick={async () => {
              await removePracticeAssignment(instance);
              toast.show("Assignment removed");
              onClose();
            }}
            className="h-11 flex-1 rounded-xl bg-danger text-[14px] font-bold text-white"
          >
            Remove it
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)} className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold text-danger">
          <Trash2 size={15} /> Remove this assignment
        </button>
      )}

      {own && <CopyStudio key={own.name + own.lastModified} fileName={own.name} fileSize={own.size} load={async () => own} task={task} onClose={() => setOwn(null)} />}
    </Sheet>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-2 border-t border-black/5 px-3.5 py-2.5 first-of-type:border-t-0 dark:border-white/10">
      <span className="text-[12.5px] font-bold opacity-70">{k}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
