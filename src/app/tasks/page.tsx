"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { TasksSkeleton } from "@/components/Skeleton";
import Link from "next/link";
import { ArrowUp, CalendarClock, GraduationCap, MapPin, Plus, Share2, Users } from "lucide-react";
import { useFriends, useGroups, useShareState, useShares, useSubjects, useTasks } from "@/lib/hooks";
import { pullSocial } from "@/lib/social";
import { useAuth } from "@/lib/auth";
import { isCloudConfigured } from "@/lib/supabase";
import { addTask } from "@/lib/repo";
import {
  BUCKET_LABEL,
  KIND_BY_ID,
  bucketOf,
  compareTasks,
  countdownText,
  daysBetween,
  groupPending,
  parseQuick,
  subtaskProgress,
} from "@/lib/tasks";
import { addDays, fmtDay, fmtTime, fromDateStr, toDateStr } from "@/lib/dates";
import type { Task } from "@/lib/types";
import { EmptyState, Sheet, SubjectTile, cx, useToast } from "@/components/ui";
import { TaskForm, TaskRow, KIND_ICON } from "@/components/TaskParts";
import { ShareForm, ShareRow } from "@/components/ShareParts";

type Tab = "todo" | "exams" | "groups" | "done";

export default function TasksPage() {
  const tasks = useTasks();
  const subjects = useSubjects();
  const toast = useToast();
  const today = toDateStr();
  const [tab, setTab] = useState<Tab>("todo");
  const [quick, setQuick] = useState("");
  const [adding, setAdding] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1",
  );
  const [editing, setEditing] = useState<Task | null>(null);
  const [sharing, setSharing] = useState(false);

  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const shares = useShares();
  const shareStates = useShareState();
  const groupList = useGroups();
  const friends = useFriends();

  useEffect(() => {
    if (!isCloudConfigured || !me) return;
    void Promise.resolve().then(() => pullSocial().catch(() => {}));
  }, [me]);

  /** Shared with you and still open, soonest first. */
  const sharedOpen = useMemo(() => {
    const st = shareStates;
    return (shares ?? [])
      .filter((s) => !st?.get(s.id)?.hidden && !st?.get(s.id)?.done)
      .sort((a, b) => (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") || b.createdAt - a.createdAt);
  }, [shares, shareStates]);

  const subjectById = useMemo(() => new Map((subjects ?? []).map((s) => [s.id, s])), [subjects]);
  const list = useMemo(() => tasks ?? [], [tasks]);

  const stats = useMemo(() => {
    const pending = list.filter((t) => !t.done);
    const weekAgo = fromDateStr(addDays(today, -6)).getTime();
    return {
      overdue: pending.filter((t) => bucketOf(t, today) === "overdue").length,
      today: pending.filter((t) => bucketOf(t, today) === "today").length,
      doneWeek: list.filter((t) => t.done && (t.doneAt ?? 0) >= weekAgo).length,
      pending: pending.length,
    };
  }, [list, today]);

  const exams = useMemo(
    () => list.filter((t) => t.kind === "exam" && !t.done).sort(compareTasks),
    [list],
  );
  const upcomingExams = exams.filter((t) => !t.dueDate || t.dueDate >= today);
  const pastExams = exams.filter((t) => t.dueDate && t.dueDate < today);
  const nextExam = upcomingExams.find((t) => t.dueDate);

  const groups = useMemo(() => groupPending(list, today), [list, today]);
  const doneList = useMemo(
    () => list.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
    [list],
  );

  const preview = quick.trim() ? parseQuick(quick, subjects ?? [], today) : null;

  async function submitQuick() {
    if (!preview || !preview.title) return;
    const t = await addTask(preview);
    setQuick("");
    toast.show(`Added: ${t.title}`, async () => {
      const { deleteTask } = await import("@/lib/repo");
      await deleteTask(t.id);
    });
  }

  if (!tasks || !subjects)
    return (
      <>
        <PageHeader title="Tasks" />
        <div className="h-4" />
        <TasksSkeleton />
      </>
    );

  const open = (t: Task) => setEditing(t);

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={
          stats.pending === 0
            ? "Nothing pending. Enjoy it."
            : `${stats.pending} pending${stats.overdue ? `, ${stats.overdue} overdue` : ""}`
        }
      />
      <div className="h-4" />

      <section className="grid grid-cols-3 gap-2.5 px-5" aria-label="Summary">
        <Stat label="Overdue" value={stats.overdue} tint={stats.overdue ? "bg-danger-soft" : "bg-surface-2"} ink={stats.overdue ? "text-danger" : "text-muted"} />
        <Stat label="Due today" value={stats.today} tint="bg-accent-soft" ink="text-accent" />
        <Stat label="Done (7 days)" value={stats.doneWeek} tint="bg-safe-soft" ink="text-safe" />
      </section>

      {nextExam && nextExam.dueDate && (
        <button
          onClick={() => setTab("exams")}
          className="mx-5 mt-3 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-2xl bg-rose-soft px-4 py-3 text-left"
        >
          <GraduationCap size={20} className="shrink-0 text-rose" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{nextExam.title}</span>
            <span className="text-[13px] text-muted">
              {countdownText(daysBetween(today, nextExam.dueDate))}
              {daysBetween(today, nextExam.dueDate) > 1 ? " to go" : ""} · {fmtDay(nextExam.dueDate)}
            </span>
          </span>
        </button>
      )}

      <div className="mt-4 px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuick();
          }}
          className="flex items-center gap-2 rounded-2xl bg-surface px-3 shadow-[0_0_0_1px_var(--line)] focus-within:shadow-[0_0_0_2px_var(--accent)]"
        >
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Quick add: DSA quiz monday"
            aria-label="Quick add a task"
            enterKeyHint="done"
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            aria-label="Add task"
            disabled={!preview?.title}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent transition disabled:opacity-35"
          >
            <ArrowUp size={18} />
          </button>
        </form>
        {preview && preview.title && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]" aria-live="polite">
            <span className={cx("rounded-full px-2.5 py-1 font-medium", KIND_BY_ID[preview.kind].tint, KIND_BY_ID[preview.kind].ink)}>
              {KIND_BY_ID[preview.kind].label}
            </span>
            {preview.subjectId && (
              <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">
                {subjectById.get(preview.subjectId)?.code}
              </span>
            )}
            <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">
              {preview.dueDate ? fmtDay(preview.dueDate) : "No date"}
            </span>
            {preview.priority === "high" && (
              <span className="rounded-full bg-danger-soft px-2.5 py-1 font-medium text-danger">High priority</span>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1.5 px-5" role="tablist">
        {([
          ["todo", "To do", stats.pending + sharedOpen.length],
          ["exams", "Exams", exams.length],
          ["groups", "Groups", groupList?.length ?? 0],
          ["done", "Done", doneList.length],
        ] as [Tab, string, number][]).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cx(
              "h-10 rounded-xl text-[13.5px] font-medium transition",
              tab === id ? "bg-text text-bg" : "bg-surface-2 text-text",
            )}
          >
            {label} <span className="tabular-nums opacity-70">{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 pb-4">
        {tab === "todo" && (
          <>
            {sharedOpen.length > 0 && (
              <section className="mb-5 px-5">
                <h2 className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-muted">
                  <Share2 size={14} /> Shared with you
                  <span className="font-normal tabular-nums">{sharedOpen.length}</span>
                </h2>
                <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                  {sharedOpen.map((s) => (
                    <ShareRow key={s.id} share={s} state={shareStates?.get(s.id)} mine={s.author === me} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {tab === "todo" &&
          (groups.length === 0 ? (
            sharedOpen.length === 0 ? (
              <EmptyState title="All clear" body="Add an assignment, quiz or project and DockIn will keep track." />
            ) : null
          ) : (
            <div className="space-y-5 px-5">
              {groups.map((g) => (
                <section key={g.bucket}>
                  <h2
                    className={cx(
                      "mb-1.5 flex items-center gap-2 text-[13px] font-semibold",
                      g.bucket === "overdue" ? "text-danger" : "text-muted",
                    )}
                  >
                    {BUCKET_LABEL[g.bucket]}
                    <span className="font-normal tabular-nums">{g.items.length}</span>
                  </h2>
                  <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                    {g.items.map((t) => (
                      <TaskRow key={t.id} task={t} today={today} subject={t.subjectId ? subjectById.get(t.subjectId) : undefined} onOpen={() => open(t)} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ))}

        {tab === "exams" &&
          (exams.length === 0 ? (
            <EmptyState
              title="No exams added"
              body="Add an exam with its date and syllabus topics to get a countdown."
            />
          ) : (
            <div className="space-y-3 px-5">
              {upcomingExams.map((t) => (
                <ExamCard key={t.id} task={t} today={today} subject={t.subjectId ? subjectById.get(t.subjectId) : undefined} onOpen={() => open(t)} />
              ))}
              {pastExams.length > 0 && (
                <>
                  <h2 className="pt-2 text-[13px] font-semibold text-muted">Past, not marked done</h2>
                  {pastExams.map((t) => (
                    <ExamCard key={t.id} task={t} today={today} subject={t.subjectId ? subjectById.get(t.subjectId) : undefined} onOpen={() => open(t)} />
                  ))}
                </>
              )}
            </div>
          ))}

        {tab === "groups" && (
          <div className="space-y-4 px-5">
            {!isCloudConfigured || !me ? (
              <EmptyState
                flush
                icon={Users}
                title="Sign in to use groups"
                body="Groups let your class share one assignment with everyone at once."
                action={
                  <Link
                    href="/circle"
                    className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-[15px] font-medium text-on-accent"
                  >
                    Get started
                  </Link>
                }
              />
            ) : (
              <>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => setSharing(true)}
                    disabled={(groupList?.length ?? 0) === 0 && (friends ?? []).length === 0}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-medium text-on-accent disabled:opacity-40"
                  >
                    <Share2 size={16} /> Share something
                  </button>
                  <Link
                    href="/circle?tab=groups"
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 text-[15px] font-medium"
                  >
                    <Users size={16} /> Friends and groups
                  </Link>
                </div>

                {(groupList?.length ?? 0) === 0 ? (
                  <EmptyState
                    flush
                    icon={Users}
                    title="No groups yet"
                    body="Make one for your section. Whatever anyone posts shows up here for everybody."
                  />
                ) : (
                  <div className="overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                    {(groupList ?? []).map((g, i) => {
                      const open = (shares ?? []).filter(
                        (s) => s.groupId === g.id && !shareStates?.get(s.id)?.done && !shareStates?.get(s.id)?.hidden,
                      ).length;
                      return (
                        <Link
                          key={g.id}
                          href={`/groups/${g.id}`}
                          className={cx("flex items-center gap-3 p-4", i > 0 && "border-t border-line")}
                        >
                          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[20px]">
                            {g.emoji ?? "\u{1F465}"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{g.name}</span>
                            <span className="block text-[12.5px] text-muted">
                              {g.members} {g.members === 1 ? "person" : "people"}
                            </span>
                          </span>
                          {open > 0 && (
                            <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent tabular-nums">
                              {open} to do
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {sharedOpen.filter((s) => !s.groupId).length > 0 && (
                  <section>
                    <h2 className="mb-1.5 text-[13px] font-semibold text-muted">Sent straight to you</h2>
                    <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                      {sharedOpen
                        .filter((s) => !s.groupId)
                        .map((s) => (
                          <ShareRow key={s.id} share={s} state={shareStates?.get(s.id)} mine={s.author === me} />
                        ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {tab === "done" &&
          (doneList.length === 0 ? (
            <EmptyState title="Nothing finished yet" body="Completed tasks show up here." />
          ) : (
            <div className="px-5">
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                {doneList.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} subject={t.subjectId ? subjectById.get(t.subjectId) : undefined} onOpen={() => open(t)} />
                ))}
              </ul>
            </div>
          ))}
      </div>

      <button
        onClick={() => (tab === "groups" ? setSharing(true) : setAdding(true))}
        aria-label={tab === "groups" ? "Share an assignment" : "Add task"}
        className="fixed right-[max(1.25rem,calc((100vw-28rem)/2+1.25rem))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-2xl bg-accent text-on-accent shadow-[0_10px_28px_-6px_rgba(31,95,214,0.65)] transition active:scale-95"
      >
        {tab === "groups" ? <Share2 size={24} /> : <Plus size={26} />}
      </button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="New task">
        <TaskForm subjects={subjects} defaultKind={tab === "exams" ? "exam" : "assignment"} onDone={() => setAdding(false)} />
      </Sheet>
      <Sheet open={sharing} onClose={() => setSharing(false)} title="Share an assignment">
        <ShareForm
          groups={groupList ?? []}
          subjects={subjects}
          friends={(friends ?? []).filter((f) => f.status === "accepted")}
          onDone={() => setSharing(false)}
        />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? KIND_BY_ID[editing.kind].label : "Task"}>
        {editing && <TaskForm key={editing.id} task={editing} subjects={subjects} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function Stat({ label, value, tint, ink }: { label: string; value: number; tint: string; ink: string }) {
  return (
    <div className={cx("rounded-2xl px-3 py-3", tint)}>
      <p className={cx("text-[24px] font-semibold leading-none tabular-nums", ink)}>{value}</p>
      <p className="mt-1.5 text-[12px] leading-tight text-muted">{label}</p>
    </div>
  );
}

function ExamCard({
  task,
  today,
  subject,
  onOpen,
}: {
  task: Task;
  today: string;
  subject?: { name: string; code: string; color: string };
  onOpen: () => void;
}) {
  const days = task.dueDate ? daysBetween(today, task.dueDate) : null;
  const prog = subtaskProgress(task);
  const Icon = KIND_ICON[task.kind];
  const urgent = days !== null && days >= 0 && days <= 3;
  const past = days !== null && days < 0;
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-stretch gap-4 rounded-3xl bg-surface p-4 text-left shadow-[0_0_0_1px_var(--line)] transition active:scale-[0.99]"
    >
      <div
        className={cx(
          "grid w-[4.5rem] shrink-0 place-items-center rounded-2xl py-3 text-center",
          past ? "bg-surface-2 text-muted" : urgent ? "bg-danger-soft text-danger" : "bg-rose-soft text-rose",
        )}
      >
        {days === null ? (
          <Icon size={26} />
        ) : past ? (
          <div>
            <p className="text-[20px] font-semibold leading-none tabular-nums">{-days}</p>
            <p className="mt-1 text-[11px]">days ago</p>
          </div>
        ) : days <= 1 ? (
          <p className="text-[15px] font-semibold">{countdownText(days)}</p>
        ) : (
          <div>
            <p className="text-[28px] font-semibold leading-none tabular-nums">{days}</p>
            <p className="mt-1 text-[11px]">days</p>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {subject && <SubjectTile name={subject.name} code={subject.code} color={subject.color} size={26} />}
          <p className="line-clamp-2 min-w-0 text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">{task.title}</p>
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted">
          {task.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={14} />
              {fmtDay(task.dueDate)}
              {task.dueTime && ` · ${fmtTime(task.dueTime)}`}
            </span>
          )}
          {task.room && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} />
              {task.room}
            </span>
          )}
        </p>
        {prog.total > 0 && (
          <div className="mt-2.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-safe" style={{ width: `${(prog.done / prog.total) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted tabular-nums">
              {prog.done} of {prog.total} topics revised
            </p>
          </div>
        )}
      </div>
    </button>
  );
}
