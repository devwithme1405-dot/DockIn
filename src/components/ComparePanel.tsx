"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, BarChart3, CalendarRange, Check, ChevronDown, Clock, Coffee, Eye, ListChecks, Lock, Plane, Send } from "lucide-react";
import type { Friend } from "@/lib/types";
import { getProfile, saveProfile } from "@/lib/repo";
import { useBackClose } from "@/lib/backClose";
import { directThread, sendMessage, useChatMe } from "@/lib/chat";
import { pct, subjectKey, toMinutes, useFriendStats, type FriendStatsData } from "@/lib/friendStats";
import { addDays, fmtDay, toDateStr } from "@/lib/dates";
import { dayClosure } from "@/lib/calendar";
import { useEvents } from "@/lib/hooks";
import { useStatsSnapshot } from "./StatsPublisher";
import { Avatar, cx, useToast } from "./ui";
import { usePreview } from "@/lib/v3/flags";
import { fmtMins, freeNow } from "@/lib/freeNow";

type Person = { id: string; name: string; avatar?: string; me: boolean; s: FriendStatsData | null };
type Tab = "attendance" | "tasks" | "trip" | "free";

const fmtPct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 10) / 10}%`.replace(".0%", "%"));
function tone(p: number | null, target: number): "safe" | "warn" | "danger" | "none" {
  if (p === null) return "none";
  if (p < target) return "danger";
  if (p < target + 3) return "warn";
  return "safe";
}
const TONE_TEXT = { safe: "text-safe", warn: "text-warn", danger: "text-danger", none: "text-muted" };
const TONE_BAR = { safe: "bg-safe", warn: "bg-warn", danger: "bg-danger", none: "bg-muted/40" };

/**
 * Compare with friends: attendance side by side (overall and per subject), who
 * has done which shared task and who still has work pending, a trip planner
 * that shows what a few days off does to everyone's numbers, and who is free
 * right now. Everyone only appears with what they chose to share.
 */
export function ComparePanel({
  friends,
  onClose,
  startOnSharing = false,
  onTop = false,
}: {
  friends: Friend[];
  onClose: () => void;
  /** Opened from a friend's invite: start on the sharing switches. */
  startOnSharing?: boolean;
  /** Shown over an open chat (back returns to the chat). */
  onTop?: boolean;
}) {
  useBackClose(true, onClose);
  const toast = useToast();
  const me = useChatMe();
  const profile = useLiveQuery(() => getProfile(), []);
  const mine = useStatsSnapshot(true);
  const stats = useFriendStats();
  const [tab, setTab] = useState<Tab>("attendance");
  const v3 = usePreview();
  const [editing, setEditing] = useState(startOnSharing);
  const share = profile?.shareStats ?? { attendance: false, tasks: false, schedule: false };
  const sharingAny = share.attendance || share.tasks || share.schedule;

  const people: Person[] = useMemo(() => {
    const list: Person[] = [
      { id: me ?? "me", name: "You", avatar: profile?.avatar, me: true, s: mine ?? null },
      ...friends.map((f) => ({ id: f.id, name: f.name, avatar: f.avatar, me: false, s: stats?.get(f.id) ?? null })),
    ];
    return list;
  }, [me, profile?.avatar, mine, friends, stats]);
  const silent = people.filter((p) => !p.me && !p.s);

  async function setShare(patch: Partial<typeof share>) {
    setEditing(true); // keep the card open while choosing
    await saveProfile({ shareStats: { ...share, ...patch } });
  }

  async function nudge(p: Person) {
    if (!me) return;
    try {
      // A card with a button that takes them straight to the sharing switches.
      await sendMessage(directThread(me, p.id), "Compare pe aaja 😄 — turn on sharing, phir dekhte hain kiski attendance zyada hai", { invite: "compare" });
      toast.show(`Asked ${p.name.split(" ")[0]}`);
    } catch {
      toast.show("Could not send that.");
    }
  }

  const TABS: [Tab, string, typeof BarChart3][] = [
    ["attendance", "Attendance", BarChart3],
    ["tasks", "Tasks", ListChecks],
    ["trip", "Trip plan", Plane],
    ["free", "Free now", Coffee],
  ];

  return (
    <div className={cx("paper-page fixed inset-0 flex flex-col", onTop ? "z-[60]" : "z-[46]")} role="dialog" aria-label="Compare">
      <header className="solid-bar rounded-none border-x-0 border-t-0 pt-[max(0.4rem,var(--sat))]">
        <div className="flex items-center gap-1.5 px-1.5 pb-1">
          <button onClick={onClose} aria-label="Back" className="grid size-11 place-items-center rounded-full active:bg-surface-2">
            <ArrowLeft size={23} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] leading-tight font-extrabold">Compare with friends</p>
            <p className="text-[12px] text-muted">You and {friends.length} friend{friends.length === 1 ? "" : "s"} · only what each person shares</p>
          </div>
          <button onClick={() => setEditing((v) => !v)} aria-label="What I share" className="flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12.5px] font-bold">
            {sharingAny ? <Eye size={15} /> : <Lock size={15} />} {sharingAny ? "Sharing" : "Private"}
          </button>
        </div>
        <nav className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none]" aria-label="Compare sections">
          {TABS.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cx(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-colors",
                tab === id ? "bg-[#3b2416] text-[#fff6ea] dark:bg-[#f0d2ab] dark:text-[#2a1608]" : "bg-surface-2 text-muted",
              )}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-12">
        {(editing || !sharingAny) && (
          <section id="compare-sharing" className={cx("form-card anim-pop mb-3", startOnSharing && "ring-2 ring-[#d9772b]/60")}>
            <div className="flex items-start gap-2">
              <p className="flex-1 text-[15px] font-extrabold">{sharingAny ? "What your friends can see" : "Turn on sharing to start comparing"}</p>
              {sharingAny && (
                <button onClick={() => setEditing(false)} className="h-8 rounded-full bg-surface-2 px-3 text-[12.5px] font-bold">
                  Done
                </button>
              )}
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">Only friends you&apos;ve accepted see this — never anyone else. Turn something off and it disappears for them instantly.</p>
            <div className="mt-3 space-y-2">
              {(
                [
                  ["attendance", "Attendance", "Your overall % and each subject's"],
                  ["tasks", "Tasks & deadlines", "How much is pending, and which shared tasks you've finished"],
                  ["schedule", "Timetable", "Lets friends plan trips with you and see when you're free"],
                ] as const
              ).map(([k, title, sub]) => (
                <label key={k} className="field flex items-center gap-3 px-3.5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-bold">{title}</span>
                    <span className="block text-[12px] text-muted">{sub}</span>
                  </span>
                  <Switch on={share[k]} onChange={(v) => void setShare({ [k]: v })} label={title} />
                </label>
              ))}
            </div>
          </section>
        )}

        <TabIntro tab={tab} />
        {tab === "attendance" && <AttendanceTab people={people} target={profile?.target ?? 75} />}
        {tab === "tasks" && <TasksTab people={people} />}
        {tab === "trip" && <TripTab people={people} />}
        {tab === "free" && (v3 ? <FreeTabV3 people={people} /> : <FreeTab people={people} />)}

        {silent.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-1 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">Not sharing yet</h2>
            <p className="mb-2 text-[12.5px] text-muted">Send them a nudge — they show up here once they turn sharing on.</p>
            <ul className="space-y-1.5">
              {silent.map((p) => (
                <li key={p.id} className="account-card flex items-center gap-3 rounded-2xl px-3 py-2">
                  <Avatar name={p.name} avatar={p.avatar} size={36} />
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{p.name}</span>
                  <button onClick={() => void nudge(p)} className="btn-connect flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold">
                    <Send size={13} /> Ask
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

const INTRO: Record<Tab, { title: string; line: string; tint: string; Icon: typeof BarChart3 }> = {
  attendance: { title: "Who's ahead?", line: "Everyone's attendance side by side — overall and in every subject.", tint: "#2f74d8", Icon: BarChart3 },
  tasks: { title: "Who's done the work?", line: "Shared assignments ticked off, and how much each of you still has left.", tint: "#de5137", Icon: ListChecks },
  trip: { title: "Planning a trip?", line: "Pick the days — see what missing those classes does to everyone's attendance.", tint: "#1f9a5f", Icon: Plane },
  free: { title: "Who's free right now?", line: "Who's in class, who isn't, and when you're all free together today.", tint: "#e5951a", Icon: Coffee },
};

function TabIntro({ tab }: { tab: Tab }) {
  const { title, line, tint, Icon } = INTRO[tab];
  return (
    <div key={tab} className="anim-pop mb-3 flex items-center gap-3 px-1">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_3px_0_rgb(0_0_0/0.12)]" style={{ background: tint }}>
        <Icon size={21} />
      </span>
      <span className="min-w-0">
        <span className="block text-[17px] leading-tight font-extrabold">{title}</span>
        <span className="block text-[12.5px] leading-snug text-muted">{line}</span>
      </span>
    </div>
  );
}

/** The top three on a podium: gold in the middle, silver left, bronze right. */
function Podium({ people, target }: { people: Person[]; target: number }) {
  const top = people.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const place = (p: Person) => top.indexOf(p);
  const H = [96, 72, 56];
  const C = ["linear-gradient(180deg,#f8d36b,#e0a623)", "linear-gradient(180deg,#e4e8ee,#b9c0ca)", "linear-gradient(180deg,#eebf91,#c98552)"];
  return (
    <div className="account-card mb-4 flex items-end justify-center gap-3 rounded-3xl px-3 pt-4">
      {order.map((p) => {
        const n = place(p);
        const a = p.s!.attendance!;
        const v = pct(a.present, a.total);
        return (
          <div key={p.id} className="anim-pop flex w-[30%] max-w-[7.5rem] flex-col items-center" style={{ "--d": `${(2 - n) * 90}ms` } as CSSProperties}>
            <div className="relative">
              <Avatar name={p.name} avatar={p.avatar} size={n === 0 ? 54 : 44} />
              {n === 0 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[18px]">👑</span>}
            </div>
            <p className="mt-1 w-full truncate text-center text-[13px] font-extrabold">{p.me ? "You" : p.name.split(" ")[0]}</p>
            <p className={cx("text-[15px] font-extrabold tabular-nums", TONE_TEXT[tone(v, p.s!.target ?? target)])}>{fmtPct(v)}</p>
            <div className="podium-rise mt-1.5 grid w-full place-items-center rounded-t-2xl text-[22px] font-extrabold text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.25)]" style={{ height: H[n], background: C[n] }}>
              {n + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-[#d9772b]" : "bg-surface-2 ring-1 ring-card-edge")}
    >
      <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-[left]", on ? "left-6" : "left-1")} />
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="account-card rounded-3xl px-5 py-7 text-center text-[13.5px] leading-snug text-muted">{children}</p>;
}

// ---------------------------------------------------------------------------
// Attendance

function AttendanceTab({ people, target: myTarget }: { people: Person[]; target: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const withAtt = people.filter((p) => p.s?.attendance && p.s.attendance.total > 0);
  const ranked = [...withAtt].sort((a, b) => (pct(b.s!.attendance!.present, b.s!.attendance!.total) ?? 0) - (pct(a.s!.attendance!.present, a.s!.attendance!.total) ?? 0));

  // Subjects anyone shares, matched by code / name.
  const subjectMap = new Map<string, string>();
  for (const p of withAtt) for (const s of p.s!.attendance!.subjects) if (!subjectMap.has(subjectKey(s))) subjectMap.set(subjectKey(s), s.code || s.name);
  const subjects = [...subjectMap];

  if (!withAtt.length) return <Empty>No attendance to compare yet. Turn on “Attendance” above and ask a friend to do the same.</Empty>;

  return (
    <div className="space-y-4">
      {ranked.length >= 2 && <Podium people={ranked} target={myTarget} />}
      <section>
        <h2 className="mb-2 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">Everyone, ranked · tap to see subjects</h2>
        <ol className="space-y-2">
          {ranked.map((p, i) => {
            const a = p.s!.attendance!;
            const v = pct(a.present, a.total);
            const t = tone(v, p.s!.target ?? myTarget);
            const isOpen = open === p.id;
            return (
              <li key={p.id} className={cx("account-card anim-pop overflow-hidden rounded-3xl", p.me && "ring-2 ring-[#d9772b]/50")} style={{ "--d": `${i * 40}ms` } as CSSProperties}>
                <button onClick={() => setOpen(isOpen ? null : p.id)} className="flex w-full items-center gap-3 p-3 text-left">
                  <span className={cx("grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold", i === 0 ? "bg-[#f5c542] text-[#5a3d00]" : i === 1 ? "bg-[#d9dde3] text-[#3a3f47]" : i === 2 ? "bg-[#e3b48a] text-[#5a3315]" : "bg-surface-2 text-muted")}>
                    {i + 1}
                  </span>
                  <Avatar name={p.name} avatar={p.avatar} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-bold">{p.name}</span>
                      <span className={cx("text-[18px] font-extrabold tabular-nums", TONE_TEXT[t])}>{fmtPct(v)}</span>
                    </span>
                    <span className="relative mt-1.5 block h-2 overflow-hidden rounded-full bg-surface-2">
                      <span className={cx("fill-grow absolute inset-y-0 left-0 rounded-full", TONE_BAR[t])} style={{ width: `${Math.min(100, v ?? 0)}%` }} />
                      <span className="absolute inset-y-0 w-[2px] bg-text/50" style={{ left: `${p.s!.target}%` }} />
                    </span>
                    <span className="mt-1 block text-[11.5px] text-muted">
                      {a.present}/{a.total} classes · target {p.s!.target}%
                    </span>
                  </span>
                  <ChevronDown size={18} className={cx("shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <ul className="space-y-2 border-t border-card-edge/50 px-4 py-3">
                    {a.subjects.map((s) => {
                      const sv = pct(s.present, s.total);
                      const st = tone(sv, p.s!.target);
                      return (
                        <li key={s.key} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold">{s.name}</span>
                            <span className="relative mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                              <span className={cx("fill-grow absolute inset-y-0 left-0 rounded-full", TONE_BAR[st])} style={{ width: `${Math.min(100, sv ?? 0)}%` }} />
                            </span>
                          </span>
                          <span className={cx("w-14 shrink-0 text-right text-[14px] font-extrabold tabular-nums", TONE_TEXT[st])}>{fmtPct(sv)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {subjects.length > 0 && (
        <section>
          <h2 className="mb-2 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">Pick a subject</h2>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
            {subjects.map(([k, label]) => (
              <button key={k} onClick={() => setSubject(subject === k ? null : k)} aria-pressed={(subject ?? subjects[0][0]) === k} className="chip">
                {label}
              </button>
            ))}
          </div>
          {(() => {
            const k = subject ?? subjects[0][0];
            const rows = withAtt
              .map((p) => {
                const s = p.s!.attendance!.subjects.find((x) => subjectKey(x) === k);
                return s ? { p, s, v: pct(s.present, s.total) } : null;
              })
              .filter((x): x is NonNullable<typeof x> => !!x)
              .sort((a, b) => (b.v ?? 0) - (a.v ?? 0));
            return (
              <ul className="account-card space-y-2.5 rounded-3xl p-3.5">
                <li className="truncate text-[13px] font-bold text-muted">{rows[0]?.s.name}</li>
                {rows.map(({ p, s, v }) => {
                  const t = tone(v, p.s!.target);
                  return (
                    <li key={p.id} className="flex items-center gap-2.5">
                      <Avatar name={p.name} avatar={p.avatar} size={30} />
                      <span className="w-20 shrink-0 truncate text-[13.5px] font-semibold">{p.name.split(" ")[0]}</span>
                      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span className={cx("fill-grow absolute inset-y-0 left-0 rounded-full", TONE_BAR[t])} style={{ width: `${Math.min(100, v ?? 0)}%` }} />
                      </span>
                      <span className={cx("w-14 shrink-0 text-right text-[13.5px] font-extrabold tabular-nums", TONE_TEXT[t])}>{fmtPct(v)}</span>
                      <span className="w-12 shrink-0 text-right text-[11px] text-muted tabular-nums">
                        {s.present}/{s.total}
                      </span>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks

function TasksTab({ people }: { people: Person[] }) {
  const today = toDateStr();
  const withTasks = people.filter((p) => p.s?.tasks);
  const byOrigin = new Map<string, { title: string; due: string | null; who: { p: Person; done: boolean }[] }>();
  for (const p of withTasks)
    for (const t of p.s!.tasks!.shared) {
      const row = byOrigin.get(t.origin) ?? { title: t.title, due: t.due, who: [] };
      row.who.push({ p, done: t.done });
      byOrigin.set(t.origin, row);
    }
  const shared = [...byOrigin.values()]
    .filter((r) => r.who.length > 1 || !r.who[0].p.me)
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  if (!withTasks.length) return <Empty>No tasks shared yet. Turn on “Tasks &amp; deadlines” above — friends who do the same show up here.</Empty>;
  const ranked = [...withTasks].sort((a, b) => b.s!.tasks!.overdue - a.s!.tasks!.overdue || b.s!.tasks!.pending - a.s!.tasks!.pending);

  return (
    <div className="space-y-4">
      {shared.length > 0 && (
        <section>
          <h2 className="mb-2 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">Shared tasks · who&apos;s finished</h2>
          <ul className="space-y-2">
            {shared.map((r, i) => {
              const done = r.who.filter((w) => w.done).length;
              const late = r.due && r.due < today;
              return (
                <li key={i} className="account-card anim-pop rounded-3xl p-3.5" style={{ "--d": `${Math.min(i, 6) * 40}ms` } as CSSProperties}>
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{r.title}</span>
                      <span className={cx("block text-[12px] font-semibold", late ? "text-danger" : "text-muted")}>{r.due ? `Due ${fmtDay(r.due)}` : "No due date"}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-safe-soft px-2.5 py-1 text-[12px] font-extrabold text-safe">
                      {done}/{r.who.length} done
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {r.who.map(({ p, done: d }) => (
                      <span
                        key={p.id}
                        className={cx(
                          "flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12.5px] font-bold",
                          d ? "bg-safe-soft text-safe" : late ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted",
                        )}
                      >
                        <Avatar name={p.name} avatar={p.avatar} size={20} />
                        {p.name.split(" ")[0]}
                        {d ? <Check size={13} strokeWidth={3} /> : <Clock size={12} />}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">How much work everyone has left</h2>
        <ul className="space-y-2">
          {ranked.map((p, i) => {
            const t = p.s!.tasks!;
            return (
              <li key={p.id} className={cx("account-card anim-pop rounded-3xl p-3", p.me && "ring-2 ring-[#d9772b]/50")} style={{ "--d": `${i * 40}ms` } as CSSProperties}>
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} avatar={p.avatar} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{p.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {t.next ? `Next: ${t.next.title} · ${fmtDay(t.next.due)}` : t.pending ? "Nothing with a date" : "All clear 🎉"}
                    </span>
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
                  {(
                    [
                      [t.overdue, "Overdue", t.overdue ? "text-danger" : ""],
                      [t.dueThisWeek, "This week", ""],
                      [t.lmsPending, "LMS left", t.lmsPending ? "text-warn" : ""],
                      [t.doneThisWeek, "Done (7d)", "text-safe"],
                    ] as const
                  ).map(([n, label, ink]) => (
                    <span key={label} className="rounded-2xl bg-surface-2/70 py-1.5">
                      <span className={cx("block text-[17px] font-extrabold tabular-nums", ink)}>{n}</span>
                      <span className="block text-[10.5px] font-semibold text-muted">{label}</span>
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip planner

function TripTab({ people }: { people: Person[] }) {
  const today = toDateStr();
  const events = useEvents();
  const [from, setFrom] = useState(addDays(today, 1));
  const [to, setTo] = useState(addDays(today, 3));
  const able = people.filter((p) => p.s?.days && p.s.attendance && p.s.attendance.total > 0);
  const [going, setGoing] = useState<Set<string> | null>(null);
  const chosen = going ?? new Set(able.map((p) => p.id));

  const days = useMemo(() => {
    const out: string[] = [];
    if (!from || !to || to < from) return out;
    for (let d = from; d <= to && out.length < 45; d = addDays(d, 1)) if (!dayClosure(events ?? [], d)) out.push(d);
    return out;
  }, [from, to, events]);

  const quick: [string, string, string][] = [
    ["Tomorrow", addDays(today, 1), addDays(today, 1)],
    ["Next 3 days", addDays(today, 1), addDays(today, 3)],
    ["Next week", addDays(today, 1), addDays(today, 7)],
  ];

  if (!able.length) return <Empty>Planning a trip needs everyone&apos;s timetable. Turn on “Timetable” above and ask your friends to do the same.</Empty>;

  return (
    <div className="space-y-3">
      <section className="form-card">
        <p className="form-label">
          <CalendarRange size={14} /> When is the trip?
        </p>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {quick.map(([label, a, b]) => (
            <button
              key={label}
              aria-pressed={from === a && to === b}
              onClick={() => {
                setFrom(a);
                setTo(b);
              }}
              className="chip"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-bold text-muted">From</span>
            <input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} className="field h-11 w-full px-3 text-[14.5px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-bold text-muted">To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="field h-11 w-full px-3 text-[14.5px]" />
          </label>
        </div>
        <p className="mt-2 text-[12px] text-muted">{days.length} college day{days.length === 1 ? "" : "s"} (holidays skipped)</p>
        <p className="mt-3 mb-1.5 text-[11.5px] font-bold text-muted">Who&apos;s going</p>
        <div className="flex flex-wrap gap-1.5">
          {able.map((p) => {
            const on = chosen.has(p.id);
            return (
              <button
                key={p.id}
                aria-pressed={on}
                onClick={() => {
                  const n = new Set(chosen);
                  if (on) n.delete(p.id);
                  else n.add(p.id);
                  setGoing(n);
                }}
                className="chip inline-flex items-center gap-1.5 pl-1"
              >
                <Avatar name={p.name} avatar={p.avatar} size={24} />
                {p.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </section>

      <ul className="space-y-2">
        {able
          .filter((p) => chosen.has(p.id))
          .map((p, i) => {
            const s = p.s!;
            const missed = new Map<number, number>();
            for (const d of days) for (const ix of s.days![d] ?? []) missed.set(ix, (missed.get(ix) ?? 0) + 1);
            const a = s.attendance!;
            const totalMissed = [...missed.values()].reduce((n, x) => n + x, 0);
            const now = pct(a.present, a.total);
            const after = pct(a.present, a.total + totalMissed);
            const subs = a.subjects.map((sub, ix) => {
              const m = missed.get(ix) ?? 0;
              return { sub, m, before: pct(sub.present, sub.total), after: pct(sub.present, sub.total + m) };
            });
            const below = subs.filter((x) => x.m > 0 && x.after !== null && x.after < s.target);
            const verdict = below.length ? "risky" : after !== null && after < s.target ? "risky" : "safe";
            return (
              <li key={p.id} className="account-card anim-pop overflow-hidden rounded-3xl" style={{ "--d": `${i * 50}ms` } as CSSProperties}>
                <div className="flex items-center gap-3 p-3">
                  <Avatar name={p.name} avatar={p.avatar} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{p.name}</span>
                    <span className="block text-[12px] text-muted">
                      Misses {totalMissed} class{totalMissed === 1 ? "" : "es"} · overall {fmtPct(now)} → <b className={TONE_TEXT[tone(after, s.target)]}>{fmtPct(after)}</b>
                    </span>
                  </span>
                  <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold", verdict === "safe" ? "bg-safe-soft text-safe" : "bg-danger-soft text-danger")}>
                    {verdict === "safe" ? "Safe to go ✓" : `${below.length || 1} subject${(below.length || 1) === 1 ? "" : "s"} below ${s.target}%`}
                  </span>
                </div>
                <ul className="space-y-1.5 border-t border-card-edge/50 px-4 py-3">
                  {subs
                    .filter((x) => x.m > 0 || x.before !== null)
                    .sort((x, y) => (x.after ?? 100) - (y.after ?? 100))
                    .map((x) => {
                      const t = tone(x.after, s.target);
                      return (
                        <li key={x.sub.key} className="flex items-center gap-2 text-[13px]">
                          <span className="min-w-0 flex-1 truncate font-semibold">{x.sub.name}</span>
                          <span className="w-8 shrink-0 text-right text-[11.5px] text-muted">{x.m ? `−${x.m}` : ""}</span>
                          <span className="w-12 shrink-0 text-right text-muted tabular-nums">{fmtPct(x.before)}</span>
                          <span className="text-muted">→</span>
                          <span className={cx("w-12 shrink-0 text-right font-extrabold tabular-nums", TONE_TEXT[t])}>{fmtPct(x.after)}</span>
                        </li>
                      );
                    })}
                </ul>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Free now

function FreeTab({ people }: { people: Person[] }) {
  const today = toDateStr();
  const [now] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const able = people.filter((p) => p.s?.today && p.s.today.date === today);
  if (!able.length) return <Empty>No one&apos;s timetable for today is shared yet. Turn on “Timetable” above.</Empty>;

  const rows = able.map((p) => {
    const cls = p.s!.today!.classes
      .map((c) => ({ ...c, a: toMinutes(c.from), b: toMinutes(c.to) }))
      .filter((c) => c.a !== null && c.b !== null) as { from: string; to: string; name: string; a: number; b: number }[];
    const current = cls.find((c) => now >= c.a && now < c.b);
    const next = cls.filter((c) => c.a > now).sort((x, y) => x.a - y.a)[0];
    return { p, cls, current, next };
  });
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  // A gap of at least 30 minutes between 8 AM and 6 PM when everyone is free.
  const busy = rows.flatMap((r) => r.cls.map((c) => [c.a, c.b] as const)).sort((x, y) => x[0] - y[0]);
  const gaps: [number, number][] = [];
  let t = Math.max(now, 8 * 60);
  for (const [a, b] of busy) {
    if (a - t >= 30 && a <= 18 * 60) gaps.push([t, a]);
    t = Math.max(t, b);
  }
  if (18 * 60 - t >= 30) gaps.push([t, 18 * 60]);

  const sorted = [...rows].sort((x, y) => Number(!!x.current) - Number(!!y.current));
  return (
    <div className="space-y-3">
      <section className="tile-tint rounded-3xl p-4" style={{ "--tint": "#2f9c8c" } as CSSProperties}>
        <p className="text-[12.5px] font-extrabold tracking-wide text-muted uppercase">When you&apos;re all free together</p>
        <p className="mt-1 text-[17px] font-extrabold">
          {gaps.length ? gaps.slice(0, 2).map(([a, b]) => `${fmt(a)} – ${fmt(b)}`).join("  ·  ") : "No common break left today"}
        </p>
      </section>
      <ul className="space-y-2">
        {sorted.map(({ p, current, next }, i) => (
          <li key={p.id} className="account-card anim-pop flex items-center gap-3 rounded-3xl p-3" style={{ "--d": `${i * 40}ms` } as CSSProperties}>
            <span className="relative">
              <Avatar name={p.name} avatar={p.avatar} size={42} />
              <span className={cx("absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-surface", current ? "bg-danger" : "bg-safe")} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{p.name}</span>
              <span className="block truncate text-[12.5px] text-muted">
                {current
                  ? `In ${current.name} till ${fmt(current.b)}`
                  : next
                    ? `Free · next ${next.name} at ${fmt(next.a)}`
                    : "Done for today"}
              </span>
            </span>
            <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold", current ? "bg-danger-soft text-danger" : "bg-safe-soft text-safe")}>
              {current ? "In class" : "Free"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Free now — DockIn 3: everyone with a shared timetable, from their two-week
// list; the class only one of you has; and when each of you is free next.

function FreeTabV3({ people }: { people: Person[] }) {
  const today = toDateStr();
  const [now] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const [open, setOpen] = useState<string | null>(null);
  const { rows, together } = freeNow(people, today, now);
  const known = rows.filter((r) => r.slots);
  const unknown = rows.filter((r) => !r.slots);
  if (!known.length) return <Empty>No one&apos;s timetable is shared yet. Turn on “Timetable” above.</Empty>;

  const sorted = [...known].sort((x, y) => Number(!!x.current) - Number(!!y.current) || Number(y.p.me) - Number(x.p.me));
  const pct = (m: number) => `${((Math.min(Math.max(m, 480), 1080) - 480) / 600) * 100}%`;

  return (
    <div className="space-y-3">
      <section className="tile-tint rounded-3xl p-4" style={{ "--tint": "#2f9c8c" } as CSSProperties}>
        <p className="text-[12.5px] font-extrabold tracking-wide text-muted uppercase">When you&apos;re all free together</p>
        <p className="mt-1 text-[17px] font-extrabold">
          {together.length ? together.slice(0, 3).map(([a, b]) => `${fmtMins(a)} – ${b >= 1080 ? "evening" : fmtMins(b)}`).join("  ·  ") : "No common break left today"}
        </p>
      </section>
      <ul className="space-y-2">
        {sorted.map(({ p, slots, current, next, free }, i) => {
          const only = slots!.filter((c) => c.only && c.b > now);
          const freeNext = free.find(([a]) => a >= now) ?? free[0];
          const line = current
            ? `In ${current.name} till ${fmtMins(current.b)}${freeNext && freeNext[0] >= current.b ? ` · free ${fmtMins(freeNext[0])}${freeNext[1] < 1080 ? `–${fmtMins(freeNext[1])}` : " onwards"}` : ""}`
            : next
              ? `Free till ${fmtMins(next.a)} · then ${next.name}`
              : slots!.length
                ? "Done for today"
                : "No classes today";
          const isOpen = open === p.id;
          return (
            <li key={p.id} className="account-card anim-pop rounded-3xl p-3" style={{ "--d": `${i * 40}ms` } as CSSProperties}>
              <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 text-left">
                <span className="relative">
                  <Avatar name={p.name} avatar={p.avatar} size={42} />
                  <span className={cx("absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-surface", current ? "bg-danger" : "bg-safe")} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{p.name}</span>
                  <span className="block truncate text-[12.5px] text-muted">{line}</span>
                  {only.length > 0 && (
                    <span className="mt-0.5 block truncate text-[12px] font-bold text-accent">
                      Only {p.me ? "you" : p.name.split(" ")[0]}: {only.map((c) => `${c.name.replace(/\s*\(.*?\)/g, "")} ${fmtMins(c.a)}`).join(", ")}
                    </span>
                  )}
                </span>
                <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold", current ? "bg-danger-soft text-danger" : "bg-safe-soft text-safe")}>
                  {current ? "In class" : "Free"}
                </span>
              </button>
              {isOpen && (
                <div className="anim-fade mt-3 space-y-2.5">
                  {/* Today, 8 AM to 6 PM: classes as blocks, the ones only they have in orange. */}
                  <div className="relative h-7 overflow-hidden rounded-lg bg-surface-2" aria-hidden>
                    {slots!.map((c) => (
                      <span
                        key={`${c.from}-${c.name}`}
                        className={cx("absolute top-0 bottom-0 rounded-md", c.only ? "bg-accent" : "bg-muted/45")}
                        style={{ left: pct(c.a), width: `calc(${pct(c.b)} - ${pct(c.a)})` }}
                      />
                    ))}
                    {now >= 480 && now <= 1080 && <span className="absolute top-0 bottom-0 w-0.5 bg-danger" style={{ left: pct(now) }} />}
                  </div>
                  <div className="flex justify-between text-[10.5px] font-semibold text-muted">
                    <span>8 AM</span>
                    <span>1 PM</span>
                    <span>6 PM</span>
                  </div>
                  {slots!.length > 0 ? (
                    <ul className="space-y-1">
                      {slots!.map((c) => (
                        <li key={`${c.from}-${c.name}`} className={cx("flex items-center gap-2 text-[13px]", c.b <= now && "opacity-50")}>
                          <span className="w-[118px] shrink-0 text-muted tabular-nums">
                            {fmtMins(c.a)} – {fmtMins(c.b)}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                          {c.only && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-extrabold text-accent">only {p.me ? "you" : "them"}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-muted">No classes today.</p>
                  )}
                  {free.length > 0 && (
                    <p className="text-[12.5px] font-semibold text-safe">
                      Free {free.map(([a, b]) => `${fmtMins(a)}${b >= 1080 ? " onwards" : `–${fmtMins(b)}`}`).join(" · ")}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {unknown.length > 0 && (
        <p className="px-2 text-[12.5px] text-muted">
          {unknown.map((r) => r.p.name).join(", ")} — today&apos;s timetable not shared yet (they need to open DockIn once after updating).
        </p>
      )}
    </div>
  );
}
