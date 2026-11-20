"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronLeft, ChevronRight, Eye, FileText, FlaskConical, Laptop, Loader2, Plus, RotateCcw, Trash2, Upload, Users } from "lucide-react";
import { db } from "@/lib/db";
import { useGroups } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { groupPeople, type GroupPerson } from "@/lib/social";
import {
  addPracticeAssignment,
  fetchAssignments,
  fetchSubmissions,
  openPracticeFile,
  practiceTaskId,
  pullPractice,
  removePracticeAssignment,
  resetPractice,
  setNextAnswer,
  startPractice,
  stopPractice,
  useNextAnswer,
  usePracticeGroup,
  type NextAnswer,
  type PracticeAssignment,
  type PracticeSubmission,
} from "@/lib/practiceLms";
import { handOver } from "@/components/AssignmentFile";
import { CopyStudio } from "@/components/SolutionStudio";
import { Avatar, Sheet, cx, useToast } from "@/components/ui";

/** Moodle's own blue, so this reads as "the LMS", not as DockIn. */
const BLUE = "#0f6cbf";

const ANSWERS: [NextAnswer, string][] = [
  ["ok", "Works"],
  ["fail", "Fails"],
  ["draft", "Stays draft"],
  ["webonly", "Website-only login"],
];

const STATUS: Record<PracticeSubmission["status"] | "none", { label: string; short: string; cls: string }> = {
  submitted: { label: "Submitted for grading", short: "Submitted", cls: "bg-[#d7f0dd] text-[#1d6b34] dark:bg-[#1e3d27] dark:text-[#8fe0a5]" },
  draft: { label: "Draft (not submitted)", short: "Draft", cls: "bg-[#fdebc8] text-[#8a5300] dark:bg-[#4a3410] dark:text-[#f5c46b]" },
  failed: { label: "Upload failed", short: "Failed", cls: "bg-[#fbd9d9] text-[#a12626] dark:bg-[#4a1c1c] dark:text-[#f5a3a3]" },
  refused: { label: "Refused (website-only login)", short: "Refused", cls: "bg-[#fbd9d9] text-[#a12626] dark:bg-[#4a1c1c] dark:text-[#f5a3a3]" },
  none: { label: "No attempt", short: "No attempt", cls: "bg-black/5 dark:bg-white/10" },
};

const stamp = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const kb = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

function span(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return [d ? `${d} day${d > 1 ? "s" : ""}` : "", h ? `${h} hour${h > 1 ? "s" : ""}` : "", !d && mm ? `${mm} min` : ""].filter(Boolean).join(" ") || "under a minute";
}

/** Each person's state for one assignment: the newest kept file, and every try. */
function byPerson(subs: PracticeSubmission[], instance: number) {
  const mine = subs.filter((s) => s.instance === instance);
  const people = new Map<string, { last: PracticeSubmission | null; kept: PracticeSubmission | null; tries: PracticeSubmission[] }>();
  for (const s of mine) {
    const p = people.get(s.userId) ?? { last: null, kept: null, tries: [] };
    p.tries.push(s);
    p.last = s;
    if (s.status === "submitted" || s.status === "draft") p.kept = s;
    people.set(s.userId, p);
  }
  return people;
}

export default function PracticeLmsPage() {
  const group = usePracticeGroup();
  const groups = useGroups();
  const { session, loading } = useAuth();
  const me = session?.user.id ?? null;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<PracticeAssignment[] | null>(null);
  const [subs, setSubs] = useState<PracticeSubmission[]>([]);
  const [people, setPeople] = useState<GroupPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openNo, setOpenNo] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const g = groups?.find((x) => x.id === group) ?? null;

  const load = useCallback(async () => {
    if (!group) return;
    try {
      const [a, s] = await Promise.all([fetchAssignments(group), fetchSubmissions(group)]);
      setList(a);
      setSubs(s);
      setError(null);
      void pullPractice().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Practice LMS.");
    }
  }, [group]);

  // First load, then live: a phone submitting shows here within a second or two.
  useEffect(() => {
    if (!group || !me) return;
    void Promise.resolve().then(load);
    void groupPeople(group)
      .then(setPeople)
      .catch(() => {});
    const sb = getSupabase();
    const ch = sb
      ?.channel(`practice:${group}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "practice_submissions", filter: `group_id=eq.${group}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "practice_assignments", filter: `group_id=eq.${group}` }, () => void load())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    // Belt and braces for networks that block the live connection.
    const poll = window.setInterval(() => void load(), 10_000);
    return () => {
      window.clearInterval(poll);
      if (ch && sb) void sb.removeChannel(ch);
    };
  }, [group, me, load]);

  async function turnOn(id: string) {
    setBusy(true);
    try {
      await startPractice(id);
      toast.show("Practice LMS on — its assignments are in your Tasks");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not turn it on.");
    }
    setBusy(false);
  }

  const name = (id: string) => (id === me ? "You" : (people.find((p) => p.userId === id)?.name ?? "Someone"));
  const courses = [...new Set((list ?? []).map((a) => a.course || "Other"))].sort();
  const open = list?.find((a) => a.instance === openNo) ?? null;
  const members = Math.max(people.length, 1);

  return (
    <main className="min-h-dvh bg-[#f2f4f7] pb-32 text-[#1d2125] dark:bg-[#15181c] dark:text-[#e6e8eb]">
      <header className="sticky top-0 z-10 text-white shadow-md" style={{ background: BLUE }}>
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-2 pt-[max(0.4rem,var(--sat))] pb-2">
          <Link href="/settings" aria-label="Back" className="grid size-11 place-items-center rounded-full active:bg-white/15">
            <ChevronLeft size={24} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[17.5px] leading-tight font-bold">Practice LMS</p>
            <p className="truncate text-[12px] opacity-85">{g ? `${g.emoji ?? ""} ${g.name} · pretend, never the real LMS` : "Pretend · nothing here reaches the real LMS"}</p>
          </div>
          {group && (
            <span className="mr-9 flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-extrabold tracking-wider">
              <span className={cx("size-1.5 rounded-full", live ? "animate-pulse bg-[#8fe0a5]" : "bg-white/60")} />
              {live ? "LIVE" : "TEST"}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        {loading ? null : !me ? (
          <Card>
            <p className="text-[15px] font-bold">Sign in to use Practice LMS</p>
            <p className="mt-1 text-[13.5px] opacity-70">It lives with your group on DockIn&apos;s cloud, so every phone (and your laptop) sees the same thing.</p>
          </Card>
        ) : !group ? (
          <>
            <Card>
              <p className="flex items-center gap-2 text-[16px] font-bold">
                <FlaskConical size={18} style={{ color: BLUE }} /> Turn on Practice LMS for a group
              </p>
              <ol className="mt-2.5 space-y-1.5 text-[13.5px] leading-snug">
                <li><b>1.</b> Pick the group you test with. Everyone in it who turns this on gets the same assignments.</li>
                <li><b>2.</b> On your laptop open <b>dock-in.vercel.app/practice-lms</b>, signed in as you — it shows every submission live.</li>
                <li><b>3.</b> On the phones: send a solution in that group, then <i>Edit &amp; submit</i>.</li>
              </ol>
            </Card>
            <p className="mt-5 mb-2 text-[13px] font-extrabold tracking-wide uppercase opacity-60">Your groups</p>
            {(groups ?? []).length === 0 ? (
              <Card>
                <p className="text-[13.5px] opacity-75">You&apos;re not in a group yet. Make one in Friends → New group, then come back.</p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {(groups ?? []).map((x) => (
                  <li key={x.id}>
                    <button
                      onClick={() => void turnOn(x.id)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-xl border border-black/10 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99] disabled:opacity-60 dark:border-white/10 dark:bg-[#1f2328]"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#e7f0fa] text-[20px] dark:bg-[#1b3550]">{x.emoji ?? "👥"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">{x.name}</span>
                        <span className="block text-[12.5px] opacity-65">{x.members} members</span>
                      </span>
                      {busy ? <Loader2 size={18} className="animate-spin opacity-60" /> : <span className="text-[13px] font-bold" style={{ color: BLUE }}>Use this</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            {error && <p className="mb-3 rounded-xl bg-[#fbd9d9] px-3.5 py-2.5 text-[13px] text-[#a12626]">{error}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <p className="text-[12px] font-extrabold tracking-wide uppercase opacity-60">The next submit from this device</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <NextChips />
                </div>
              </Card>
              <Card>
                <p className="flex items-center gap-1.5 text-[12px] font-extrabold tracking-wide uppercase opacity-60">
                  <Laptop size={13} /> Watch from a laptop
                </p>
                <p className="mt-1.5 text-[13px] leading-snug opacity-80">
                  Open <b>dock-in.vercel.app/practice-lms</b> signed in as you. Every phone&apos;s submission shows up here live.
                </p>
              </Card>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-[19px] font-bold">Assignments</p>
              <button onClick={() => setAdding(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-bold text-white shadow-sm active:scale-[0.98]" style={{ background: BLUE }}>
                <Plus size={17} /> Add assignment
              </button>
            </div>

            {list === null && !error && (
              <div className="mt-6 grid place-items-center opacity-60">
                <Loader2 size={22} className="animate-spin" />
              </div>
            )}
            {courses.map((course) => (
              <section key={course} className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-[#1f2328]">
                <p className="border-b border-black/5 px-4 py-2.5 text-[14.5px] font-bold dark:border-white/10" style={{ color: BLUE }}>
                  {course}
                </p>
                <ul>
                  {(list ?? [])
                    .filter((a) => (a.course || "Other") === course)
                    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
                    .map((a, i) => {
                      const ppl = byPerson(subs, a.instance);
                      const done = [...ppl.values()].filter((p) => p.kept?.status === "submitted").length;
                      const minePerson = me ? ppl.get(me) : undefined;
                      const st = minePerson?.kept?.status ?? "none";
                      return (
                        <li key={a.instance} className="anim-pop" style={{ "--d": `${i * 30}ms` } as CSSProperties}>
                          <button onClick={() => setOpenNo(a.instance)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03] dark:active:bg-white/5">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e7f0fa] dark:bg-[#1b3550]" style={{ color: BLUE }}>
                              <FileText size={17} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14.5px] font-semibold">{a.title}</span>
                              <span className="block text-[12px] opacity-65">
                                {a.dueAt ? `Due ${stamp(a.dueAt)}` : "No due date"} · <Users size={11} className="inline -translate-y-px" /> {done}/{members} submitted
                              </span>
                            </span>
                            <span className={cx("shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold", STATUS[st].cls)}>{st === "none" ? "No attempt" : STATUS[st].short}</span>
                            <ChevronRight size={16} className="shrink-0 opacity-40" />
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
            {list && list.length === 0 && <Card><p className="text-center text-[13.5px] opacity-70">No assignments. Add one.</p></Card>}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                onClick={async () => {
                  try {
                    await resetPractice();
                    await load();
                    toast.show("All submissions cleared — for everyone in the group");
                  } catch (e) {
                    toast.show(e instanceof Error ? e.message : "Could not clear it.");
                  }
                }}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-[14px] font-bold dark:border-white/10 dark:bg-[#1f2328]"
              >
                <RotateCcw size={16} /> Clear all submissions
              </button>
              <button
                onClick={async () => {
                  await stopPractice();
                  toast.show("Practice LMS off on this device");
                }}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-[14px] font-bold dark:border-white/10 dark:bg-[#1f2328]"
              >
                Turn off on this device
              </button>
            </div>
          </>
        )}
      </div>

      {adding && <AddAssignment courses={courses} onClose={() => setAdding(false)} onAdded={load} />}
      {open && (
        <AssignmentView
          a={open}
          subs={subs}
          people={people}
          me={me}
          name={name}
          onClose={() => setOpenNo(null)}
          onChanged={load}
        />
      )}
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-black/5 bg-white px-4 py-3.5 shadow-sm dark:border-white/10 dark:bg-[#1f2328]">{children}</div>;
}

function NextChips() {
  const next = useNextAnswer();
  return (
    <>
      {ANSWERS.map(([id, label]) => (
        <button
          key={id}
          onClick={() => setNextAnswer(id)}
          aria-pressed={next === id}
          className={cx("h-9 rounded-full border px-3.5 text-[13px] font-bold transition", next === id ? "border-transparent text-white" : "border-black/15 dark:border-white/20")}
          style={next === id ? { background: BLUE } : undefined}
        >
          {label}
        </button>
      ))}
      <p className="w-full text-[12px] opacity-65">{next === "ok" ? "Goes in like a normal submission." : "Only the next one — then it works again."}</p>
    </>
  );
}

function AddAssignment({ courses, onClose, onAdded }: { courses: string[]; onClose: () => void; onAdded: () => Promise<void> }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState(courses[0] ?? "");
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 2 * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
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
      <p className="mt-2 text-[12px] text-muted">Everyone in the group with Practice LMS on gets it in Tasks, like an LMS assignment.</p>
      <button
        disabled={!title.trim() || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await addPracticeAssignment({ title: title.trim(), course: course.trim() || "Practice", dueDate: date || null, dueTime: date ? time || "23:59" : null });
            await onAdded();
            toast.show("Added — it's in Tasks now");
            onClose();
          } catch (e) {
            toast.show(e instanceof Error ? e.message : "Could not add it.");
            setBusy(false);
          }
        }}
        className="mt-4 h-12 w-full rounded-xl text-[15.5px] font-bold text-white disabled:opacity-50"
        style={{ background: BLUE }}
      >
        {busy ? "Adding…" : "Add assignment"}
      </button>
    </Sheet>
  );
}

/** One assignment: my submission like Moodle's page, then everyone's (the teacher view). */
function AssignmentView({
  a,
  subs,
  people,
  me,
  name,
  onClose,
  onChanged,
}: {
  a: PracticeAssignment;
  subs: PracticeSubmission[];
  people: GroupPerson[];
  me: string | null;
  name: (id: string) => string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState<File | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const task = useLiveQuery(() => db.tasks.get(practiceTaskId(a.instance)), [a.instance]);
  const ppl = byPerson(subs, a.instance);
  const mine = me ? ppl.get(me) : undefined;
  const kept = mine?.kept ?? null;
  const everyone = [...new Set([...people.map((p) => p.userId), ...ppl.keys()])].sort((x, y) => (x === me ? -1 : y === me ? 1 : name(x).localeCompare(name(y))));

  async function view(s: PracticeSubmission) {
    if (!s.path) return;
    setOpening(s.id);
    try {
      await handOver(await openPracticeFile(s.path), s.name);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not open it.");
    }
    setOpening(null);
  }

  const timeRow = !a.dueAt
    ? "No due date"
    : kept?.status === "submitted"
      ? kept.at <= a.dueAt
        ? `Submitted ${span(a.dueAt - kept.at)} early`
        : `Submitted ${span(kept.at - a.dueAt)} late`
      : a.dueAt > now
        ? `${span(a.dueAt - now)} left`
        : `Overdue by ${span(now - a.dueAt)}`;

  return (
    <Sheet open onClose={onClose} title={a.title}>
      <p className="-mt-2 mb-3 text-[13px] text-muted">{a.course}</p>

      <div className="overflow-hidden rounded-xl border border-black/10 text-[13.5px] dark:border-white/10">
        <p className="px-3.5 py-2 text-[14px] font-bold text-white" style={{ background: BLUE }}>
          Your submission status
        </p>
        <Row k="Submission status">
          <span className={cx("rounded px-1.5 py-0.5 text-[12px] font-bold", STATUS[kept?.status ?? "none"].cls)}>{STATUS[kept?.status ?? "none"].label}</span>
        </Row>
        <Row k="Grading status">Not graded</Row>
        <Row k="Due date">{a.dueAt ? stamp(a.dueAt) : "—"}</Row>
        <Row k="Time remaining">{timeRow}</Row>
        <Row k="Last modified">{kept ? stamp(kept.at) : "—"}</Row>
        <Row k="File submissions">
          {kept ? (
            <button onClick={() => void view(kept)} className="flex min-w-0 items-center gap-1.5 text-left font-semibold" style={{ color: BLUE }}>
              {opening === kept.id ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Eye size={14} className="shrink-0" />}
              <span className="truncate">{kept.name}</span>
              <span className="shrink-0 font-normal opacity-60">· {kb(kept.size)}</span>
            </button>
          ) : (
            "—"
          )}
        </Row>
      </div>

      <p className="mt-5 mb-1.5 flex items-center gap-1.5 text-[12px] font-extrabold tracking-wide text-muted uppercase">
        <Users size={13} /> Everyone in the group
      </p>
      <ul className="space-y-1.5">
        {everyone.map((id) => {
          const p = ppl.get(id);
          const st = p?.kept?.status ?? (p?.last ? p.last.status : "none");
          const person = people.find((x) => x.userId === id);
          return (
            <li key={id} className="rounded-xl bg-surface-2 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={person?.name ?? name(id)} avatar={person?.avatar ?? undefined} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{name(id)}</span>
                  <span className="block truncate text-[11.5px] text-muted">
                    {p?.kept ? `${p.kept.name} · ${kb(p.kept.size)} · ${stamp(p.kept.at)}` : p?.last ? `Last try ${stamp(p.last.at)}` : "Nothing yet"}
                  </span>
                </span>
                <span className={cx("shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold", STATUS[st].cls)}>{STATUS[st].short}</span>
                {p?.kept?.path && (
                  <button onClick={() => void view(p.kept!)} aria-label={`Open ${name(id)}'s file`} className="grid size-8 shrink-0 place-items-center rounded-full bg-surface">
                    {opening === p.kept.id ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  </button>
                )}
              </div>
              {p && p.tries.length > 1 && (
                <ul className="mt-2 space-y-1 border-t border-black/5 pt-2 dark:border-white/10">
                  {[...p.tries].reverse().map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-[11.5px]">
                      <span className={cx("rounded px-1 py-px font-bold", STATUS[t.status].cls)}>{STATUS[t.status].short}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">
                        {t.name} · {stamp(t.at)}
                      </span>
                      {t.path && (
                        <button onClick={() => void view(t)} className="shrink-0 font-bold" style={{ color: BLUE }}>
                          Open
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

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
      <button onClick={() => input.current?.click()} disabled={!task} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>
        {kept ? <Check size={17} /> : <Upload size={17} />} {kept ? "Edit submission" : "Add submission"}
      </button>
      {confirm ? (
        <div className="mt-2 flex gap-2">
          <button onClick={() => setConfirm(false)} className="h-11 flex-1 rounded-xl bg-surface-2 text-[14px] font-bold">
            Keep
          </button>
          <button
            onClick={async () => {
              try {
                await removePracticeAssignment(a.instance);
                await onChanged();
                toast.show("Assignment removed for everyone");
                onClose();
              } catch (e) {
                toast.show(e instanceof Error ? e.message : "Could not remove it.");
              }
            }}
            className="h-11 flex-1 rounded-xl bg-danger text-[14px] font-bold text-white"
          >
            Remove for everyone
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)} className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold text-danger">
          <Trash2 size={15} /> Remove this assignment
        </button>
      )}

      {own && task && (
        <CopyStudio
          key={own.name + own.lastModified}
          fileName={own.name}
          fileSize={own.size}
          load={async () => own}
          task={task}
          onClose={() => {
            setOwn(null);
            void onChanged();
          }}
        />
      )}
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
