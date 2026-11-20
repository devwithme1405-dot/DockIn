"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, Ban, Check, Clock, QrCode as QrIcon, Search, Share2, UserCheck, UserPlus, Users, X } from "lucide-react";
import type { AttendanceState, Friend } from "@/lib/types";
import { Avatar, STATE_TEXT, cx } from "./ui";
import { useBackClose } from "@/lib/backClose";

const WORD: Record<AttendanceState, string> = {
  safe: "Safe",
  warn: "Cutting it close",
  danger: "Below target",
  none: "Not tracking yet",
};
const CHIP: Record<AttendanceState, string> = {
  safe: "bg-safe-soft",
  warn: "bg-warn-soft",
  danger: "bg-danger-soft",
  none: "bg-surface-2",
};

function describe(f: Friend): string {
  return [f.branch, f.year ? `Year ${f.year}` : null, f.section].filter(Boolean).join(" · ") || "Student";
}

/** "Today 4:30 pm", "Yesterday", "3 Nov" — how the history reads. */
function when(ms: number, now: number): string {
  const d = new Date(ms);
  const t = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(t) - day(d)) / 86400000);
  const clock = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  if (diff <= 0) return `Today, ${clock}`;
  if (diff === 1) return `Yesterday, ${clock}`;
  if (diff < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
}

function bucket(ms: number | undefined, now: number): string {
  if (!ms) return "Earlier";
  const days = (now - ms) / 86400000;
  if (days < 1) return "Today";
  if (days < 7) return "This week";
  if (days < 31) return "This month";
  return "Earlier";
}

type Event = { key: string; at?: number; who: Friend; text: string; kind: "friends" | "in" | "out" };

type Tab = "friends" | "requests" | "activity";

/**
 * Everyone you know on DockIn, full screen: your friends, requests both ways,
 * and a history of who joined when (like Instagram's activity).
 */
export function FriendsPanel({
  accepted,
  requests,
  sent,
  blocked,
  sharesAttendance,
  onToggleAttendance,
  onAccept,
  onReject,
  onBlock,
  onShow,
  onRemove,
  onCancel,
  onUnblock,
  onAdd,
  onMyQr,
  onClose,
}: {
  accepted: Friend[];
  requests: Friend[];
  sent: Friend[];
  blocked: { id: string; name: string }[];
  sharesAttendance: boolean;
  onToggleAttendance: (on: boolean) => void;
  onAccept: (f: Friend) => void;
  onReject: (f: Friend) => void;
  onBlock: (f: Friend) => void;
  onShow: (f: Friend) => void;
  onRemove: (f: Friend) => void;
  onCancel: (f: Friend) => void;
  onUnblock: (id: string, name: string) => void;
  onAdd: () => void;
  onMyQr: () => void;
  onClose: () => void;
}) {
  useBackClose(true, onClose);
  const [tab, setTab] = useState<Tab>(requests.length ? "requests" : "friends");
  const [q, setQ] = useState("");
  const [now] = useState(() => Date.now());

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = k ? accepted.filter((f) => f.name.toLowerCase().includes(k)) : accepted;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [accepted, q]);

  const events = useMemo(() => {
    const out: Event[] = [];
    for (const f of accepted)
      out.push({
        key: `f-${f.id}`,
        at: f.since ?? f.requestedAt,
        who: f,
        kind: "friends",
        text: f.theyAsked ? "and you became friends" : "accepted your friend request",
      });
    for (const f of requests) out.push({ key: `i-${f.id}`, at: f.requestedAt, who: f, kind: "in", text: "wants to be your friend" });
    for (const f of sent) out.push({ key: `o-${f.id}`, at: f.requestedAt, who: f, kind: "out", text: "hasn't answered your request yet" });
    return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  }, [accepted, requests, sent]);

  const groupsOf = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of events) {
      const b = bucket(e.at, now);
      m.set(b, [...(m.get(b) ?? []), e]);
    }
    return [...m];
  }, [events, now]);

  const tabs: [Tab, string, number][] = [
    ["friends", "Friends", accepted.length],
    ["requests", "Requests", requests.length],
    ["activity", "Activity", 0],
  ];

  return (
    <div className="paper-page fixed inset-0 z-[45] flex flex-col" role="dialog" aria-label="Friends">
      <header className="solid-bar flex items-center gap-1.5 rounded-none border-x-0 border-t-0 px-1.5 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1.5">
        <button onClick={onClose} aria-label="Back" className="grid size-11 place-items-center rounded-full active:bg-surface-2">
          <ArrowLeft size={23} />
        </button>
        <p className="flex-1 text-[18px] font-extrabold">Friends</p>
        <button onClick={onAdd} aria-label="Add a friend" className="grid size-11 place-items-center rounded-full text-mess active:bg-surface-2">
          <UserPlus size={21} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-10">
        {/* Who you have, at a glance. */}
        <section className="sunset anim-pop relative overflow-hidden rounded-[26px] px-4 py-4">
          <span className="blob anim-float -top-10 -right-6 size-28" aria-hidden />
          <div className="relative flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[34px] leading-none font-extrabold tabular-nums">{accepted.length}</p>
              <p className="mt-1 text-[13px] font-semibold text-muted">
                {accepted.length === 1 ? "friend" : "friends"}
                {requests.length > 0 && ` · ${requests.length} waiting`}
                {sent.length > 0 && ` · ${sent.length} sent`}
              </p>
            </div>
            <div className="flex -space-x-3">
              {accepted.slice(0, 4).map((f) => (
                <span key={f.id} className="rounded-full ring-[2.5px] ring-surface">
                  <Avatar name={f.name} avatar={f.avatar} size={38} />
                </span>
              ))}
            </div>
          </div>
          <div className="relative mt-3.5 flex gap-2">
            <button onClick={onAdd} className="btn-leather flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13.5px] active:scale-[0.97]">
              <UserPlus size={16} /> Add friend
            </button>
            <button onClick={onMyQr} className="btn-paper flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13.5px] active:scale-[0.97]">
              <QrIcon size={16} /> My QR
            </button>
          </div>
        </section>

        <nav className="solid-bar sticky top-0 z-[1] mt-3 flex gap-1 rounded-2xl p-1" aria-label="Friends sections">
          {tabs.map(([id, label, n]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cx(
                "relative flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold transition-colors",
                tab === id ? "btn-leather" : "text-muted active:bg-surface-2",
              )}
            >
              {label}
              {id === "requests" && n > 0 && (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-orange px-1 text-[10.5px] text-white">{n}</span>
              )}
            </button>
          ))}
        </nav>

        {tab === "friends" && (
          <div key="friends" className="mt-3 space-y-4">
            {accepted.length > 5 && (
              <label className="solid-bar flex h-11 items-center gap-2.5 rounded-2xl px-3.5 focus-within:border-orange">
                <Search size={17} className="shrink-0 text-muted" />
                <input
                  className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
                  placeholder="Find a friend"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Find a friend"
                />
              </label>
            )}
            {accepted.length === 0 ? (
              <div className="anim-pop rounded-3xl border-[1.5px] border-dashed border-card-edge px-5 py-8 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-mess-soft text-mess">
                  <Users size={26} />
                </span>
                <p className="mt-3 text-[16px] font-extrabold">No friends yet</p>
                <p className="mt-1 text-[13.5px] text-muted">Show your QR to a classmate or scan theirs — it takes two seconds.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {shown.map((f, i) => (
                  <li
                    key={f.id}
                    className="anim-pop lift flex items-center gap-3 rounded-3xl bg-surface p-3"
                    style={{ "--d": `${Math.min(i, 8) * 35}ms` } as CSSProperties}
                  >
                    <button onClick={() => onShow(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="rounded-full bg-gradient-to-tr from-[#f5c590] to-[#e0662b] p-[2px]">
                        <span className="block rounded-full bg-bg p-[2px]">
                          <Avatar name={f.name} avatar={f.avatar} size={46} />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15.5px] font-bold">{f.name}</span>
                        <span className="block truncate text-[12.5px] text-muted">{describe(f)}</span>
                        {f.since && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold text-mess">
                            <UserCheck size={12} /> Friends since {new Date(f.since).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </span>
                    </button>
                    {f.attendanceState && f.attendanceState !== "none" && (
                      <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold", CHIP[f.attendanceState], STATE_TEXT[f.attendanceState])}>
                        {WORD[f.attendanceState]}
                      </span>
                    )}
                    <button onClick={() => onRemove(f)} aria-label={`Remove ${f.name}`} className="grid size-9 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2">
                      <X size={16} />
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="py-6 text-center text-[13.5px] text-muted">Nobody by that name.</li>}
              </ul>
            )}

            {blocked.length > 0 && (
              <section>
                <h2 className="mb-2 text-[12.5px] font-bold tracking-wide text-muted uppercase">Blocked</h2>
                <ul className="overflow-hidden rounded-3xl border-[1.5px] border-card-edge bg-card">
                  {blocked.map((b, i) => (
                    <li key={b.id} className={cx("flex items-center gap-3 p-3.5", i > 0 && "border-t border-line")}>
                      <Ban size={18} className="shrink-0 text-muted" />
                      <p className="min-w-0 flex-1 truncate text-[14.5px]">{b.name}</p>
                      <button onClick={() => onUnblock(b.id, b.name)} className="btn-paper h-9 rounded-full px-3 text-[13px] font-semibold">
                        Unblock
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <label className="tile-tint flex items-center gap-3 rounded-3xl p-4" style={{ "--tint": "#2f9c8c", "--tint-2": "#1e7266" } as CSSProperties}>
              <span className="tile-icon grid size-10 shrink-0 place-items-center rounded-xl">
                <Share2 size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">Show friends my attendance</span>
                <span className="block text-[12.5px] text-muted">Only Safe, Cutting it close or Below target. Never the number.</span>
              </span>
              <input
                type="checkbox"
                className="size-6 shrink-0 accent-[#1e7266]"
                checked={sharesAttendance}
                onChange={(e) => onToggleAttendance(e.target.checked)}
              />
            </label>
          </div>
        )}

        {tab === "requests" && (
          <div key="requests" className="mt-3 space-y-5">
            <section>
              <h2 className="mb-2 text-[12.5px] font-bold tracking-wide text-muted uppercase">Waiting for you</h2>
              {requests.length === 0 ? (
                <p className="rounded-3xl bg-surface-2/60 px-4 py-5 text-center text-[13.5px] text-muted">No new requests.</p>
              ) : (
                <ul className="space-y-2">
                  {requests.map((f, i) => (
                    <li
                      key={f.id}
                      className="tile-tint anim-pop flex items-center gap-3 rounded-3xl p-3"
                      style={{ "--tint": "#f2871f", "--tint-2": "#d24f1e", "--d": `${i * 40}ms` } as CSSProperties}
                    >
                      <Avatar name={f.name} avatar={f.avatar} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold">{f.name}</p>
                        <p className="truncate text-[12.5px] text-muted">
                          {describe(f)}
                          {f.requestedAt ? ` · ${when(f.requestedAt, now)}` : ""}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => onAccept(f)} className="btn-leather flex h-9 flex-1 items-center justify-center gap-1 rounded-xl text-[13.5px]">
                            <Check size={15} /> Accept
                          </button>
                          <button onClick={() => onReject(f)} className="btn-paper h-9 flex-1 rounded-xl text-[13.5px] font-bold">
                            Reject
                          </button>
                          <button onClick={() => onBlock(f)} aria-label={`Block ${f.name}`} className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                            <Ban size={16} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {sent.length > 0 && (
              <section>
                <h2 className="mb-2 text-[12.5px] font-bold tracking-wide text-muted uppercase">You sent</h2>
                <ul className="space-y-2">
                  {sent.map((f, i) => (
                    <li key={f.id} className="anim-pop lift flex items-center gap-3 rounded-3xl bg-surface p-3" style={{ "--d": `${i * 40}ms` } as CSSProperties}>
                      <Avatar name={f.name} avatar={f.avatar} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-bold">{f.name}</span>
                        <span className="flex items-center gap-1 text-[12px] text-muted">
                          <Clock size={12} /> Waiting{f.requestedAt ? ` · ${when(f.requestedAt, now)}` : ""}
                        </span>
                      </span>
                      <button onClick={() => onCancel(f)} className="btn-paper h-9 rounded-full px-3 text-[13px] font-semibold">
                        Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div key="activity" className="mt-3">
            {events.length === 0 ? (
              <p className="rounded-3xl bg-surface-2/60 px-4 py-8 text-center text-[13.5px] text-muted">Your friend history shows up here.</p>
            ) : (
              groupsOf.map(([label, list]) => (
                <section key={label} className="mb-4">
                  <h2 className="mb-2 text-[12.5px] font-bold tracking-wide text-muted uppercase">{label}</h2>
                  <ol className="relative space-y-1 pl-1">
                    <span className="absolute top-3 bottom-3 left-[27px] w-[2px] rounded-full bg-card-edge/70" aria-hidden />
                    {list.map((e, i) => (
                      <li key={e.key} className="anim-pop relative flex items-center gap-3 rounded-2xl px-1 py-2" style={{ "--d": `${Math.min(i, 8) * 40}ms` } as CSSProperties}>
                        <button onClick={() => onShow(e.who)} className="relative shrink-0 rounded-full" aria-label={`${e.who.name}`}>
                          <Avatar name={e.who.name} avatar={e.who.avatar} size={46} />
                          <span
                            className={cx(
                              "absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full text-white ring-2 ring-bg",
                              e.kind === "friends" ? "bg-safe" : e.kind === "in" ? "bg-orange" : "bg-[#4b7fc4]",
                            )}
                          >
                            {e.kind === "friends" ? <UserCheck size={13} /> : e.kind === "in" ? <UserPlus size={13} /> : <Clock size={12} />}
                          </span>
                        </button>
                        <span className="min-w-0 flex-1 text-[14px] leading-snug">
                          <b className="font-extrabold">{e.who.name}</b> <span className="text-text/90">{e.text}</span>
                          <span className="block text-[12px] text-muted">{e.at ? when(e.at, now) : "A while ago"}</span>
                        </span>
                        {e.kind === "in" && (
                          <button onClick={() => onAccept(e.who)} className="btn-leather h-8 shrink-0 rounded-full px-3 text-[12.5px]">
                            Accept
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
