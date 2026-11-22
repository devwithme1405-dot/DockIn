"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Lock, RefreshCw, Search, Send, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { directThread, groupThread, sendTaskTo, useChatMe, type ThreadId } from "@/lib/chat";
import type { Task } from "@/lib/types";
import { Avatar, Sheet, cx, useToast } from "./ui";

type Target = { thread: ThreadId; name: string; sub: string; avatar?: string; emoji?: string | null; group: boolean };

type Step = "ask" | "pick" | "update";

/**
 * Sending a task to friends and groups. Everyone it reaches gets it in their
 * Tasks once — even if they are in a group you picked and you also picked them
 * by name.
 *
 * - `new`: right after making it — keep it to yourself, or share it.
 * - `send`: later, from the task — pick who gets it (or, shared before, the
 *   "send changes" choice below).
 * - `update`: a shared task whose details changed — send the changes to the
 *   same chats (their copy changes, no second task), and/or add more people.
 */
export function ShareTask({ task, mode = "new", onClose }: { task: Task | null; mode?: "new" | "send" | "update"; onClose: () => void }) {
  const toast = useToast();
  const me = useChatMe();
  const sharedWith = useMemo(() => task?.sharedWith ?? [], [task]);
  const shared = sharedWith.length > 0;
  const [chosenStep, setStep] = useState<Step | null>(null);
  const step: Step = chosenStep ?? (mode === "update" || (mode === "send" && shared) ? "update" : mode === "send" ? "pick" : "ask");
  // Chats that already have it start ticked: they get the changes.
  const [chosen, setPicked] = useState<Set<ThreadId> | null>(null);
  const picked = useMemo(() => chosen ?? new Set<ThreadId>(sharedWith), [chosen, sharedWith]);
  const [busy, setBusy] = useState(false);
  const targets = useChatTargets(sharedWith);

  const names = useMemo(() => {
    const byThread = new Map(targets.map((t) => [t.thread, t.name]));
    return sharedWith.map((th) => byThread.get(th)).filter(Boolean) as string[];
  }, [targets, sharedWith]);

  function close() {
    setStep(null);
    setPicked(null);
    onClose();
  }

  async function send(threads: ThreadId[]) {
    if (!task || !threads.length) return;
    setBusy(true);
    try {
      const subject = task.subjectId ? (await db.subjects.get(task.subjectId))?.name : null;
      // Shared before: the ones that had it get the changes on the same task.
      await sendTaskTo(threads, task, subject, shared);
      const old = threads.filter((t) => sharedWith.includes(t)).length;
      const added = threads.length - old;
      toast.show(
        shared && old && !added
          ? "Changes sent — their task is updated"
          : shared && old
            ? `Changes sent, and shared with ${added} more`
            : threads.length === 1
              ? "Shared — it's in their Tasks now"
              : `Shared with ${threads.length} chats — everyone gets it once`,
      );
      close();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not share it.");
    }
    setBusy(false);
  }

  const toggle = (t: ThreadId) =>
    setPicked(() => {
      const n = new Set(picked);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const who =
    names.length === 0
      ? `${sharedWith.length} ${sharedWith.length === 1 ? "chat" : "chats"}`
      : names.length <= 2
        ? names.join(" & ")
        : `${names.slice(0, 2).join(", ")} +${sharedWith.length - 2}`;

  return (
    <Sheet
      open={!!task}
      onClose={close}
      title={step === "ask" ? "Task added" : step === "update" ? (mode === "update" ? "Send the changes?" : "Shared task") : "Share with"}
    >
      {step === "update" ? (
        <div className="space-y-2.5">
          <div className="field px-4 py-3">
            <p className="truncate text-[15px] font-bold">{task?.title}</p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">Shared with {who}</p>
          </div>
          <button
            onClick={() => void send(sharedWith)}
            disabled={busy}
            className="form-card flex w-full items-center gap-3 text-left active:scale-[0.99] disabled:opacity-60"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#d9772b]/15 text-[#b85d1c]">
              <RefreshCw size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-extrabold">{busy ? "Sending…" : `Update it for ${who}`}</span>
              <span className="block text-[12.5px] text-muted">Their task changes to match yours — no second copy.</span>
            </span>
          </button>
          <button
            onClick={() => (me ? setStep("pick") : toast.show("Sign in to Friends to share tasks."))}
            className="form-card flex w-full items-center gap-3 text-left active:scale-[0.99]"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-text">
              <UserPlus size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-extrabold">Add more people</span>
              <span className="block text-[12.5px] text-muted">The same chats get the changes, new ones get the task.</span>
            </span>
          </button>
          <button onClick={close} className="h-11 w-full rounded-2xl text-[14.5px] font-bold text-muted active:bg-surface-2">
            {mode === "update" ? "Don't send — just for me" : "Close"}
          </button>
        </div>
      ) : step === "ask" ? (
        <div className="space-y-2.5">
          <p className="field truncate px-4 py-3 text-[15px] font-bold">{task?.title}</p>
          <button onClick={close} className="form-card flex w-full items-center gap-3 text-left active:scale-[0.99]">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-text">
              <Lock size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-extrabold">Only for me</span>
              <span className="block text-[12.5px] text-muted">Stays in your Tasks, nobody else sees it.</span>
            </span>
          </button>
          <button
            onClick={() => (me ? setStep("pick") : toast.show("Sign in to Friends to share tasks."))}
            className="form-card flex w-full items-center gap-3 text-left active:scale-[0.99]"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#d9772b]/15 text-[#b85d1c]">
              <Users size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-extrabold">Share it</span>
              <span className="block text-[12.5px] text-muted">Pick friends or groups — it lands in their Tasks too.</span>
            </span>
          </button>
        </div>
      ) : (
        <div>
          <ChatTargetList targets={targets} picked={picked} toggle={toggle} had={sharedWith} />
          <button
            onClick={() => void send([...picked])}
            disabled={!picked.size || busy}
            className="btn-leather mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] disabled:opacity-50"
          >
            <Send size={17} /> {busy ? "Sending…" : picked.size ? `Send to ${picked.size}` : "Pick who gets it"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Every group and accepted friend, as chats to send to; `first` ones lead their section. */
const NONE: ThreadId[] = [];

export function useChatTargets(first: ThreadId[] = NONE): Target[] {
  const me = useChatMe();
  const groups = useLiveQuery(() => db.groups.toArray(), []);
  const friends = useLiveQuery(() => db.friends.filter((f) => f.status === "accepted").toArray(), []);
  return useMemo(() => {
    const all: Target[] = [
      ...(groups ?? []).map((g) => ({
        thread: groupThread(g.id),
        name: g.name,
        sub: `${g.members} members`,
        avatar: g.photo ?? undefined,
        emoji: g.emoji ?? "👥",
        group: true,
      })),
      ...(me
        ? (friends ?? []).map((f) => ({
            thread: directThread(me, f.id),
            name: f.name,
            sub: [f.branch, f.year ? `Year ${f.year}` : null].filter(Boolean).join(" · ") || "Friend",
            avatar: f.avatar,
            group: false,
          }))
        : []),
    ];
    const lead = new Set(first);
    return all.sort((a, b) => Number(b.group) - Number(a.group) || Number(lead.has(b.thread)) - Number(lead.has(a.thread)));
  }, [groups, friends, me, first]);
}

/** A searchable, tickable list of groups and friends. `had`: chats that already have the thing. */
export function ChatTargetList({
  targets: all,
  picked,
  toggle,
  had = [],
}: {
  targets: Target[];
  picked: Set<ThreadId>;
  toggle: (t: ThreadId) => void;
  had?: ThreadId[];
}) {
  const [q, setQ] = useState("");
  const k = q.trim().toLowerCase();
  const targets = k ? all.filter((t) => t.name.toLowerCase().includes(k)) : all;
  return (
    <>
      <label className="field mb-2 flex h-11 items-center gap-2.5 px-3.5">
        <Search size={17} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search friends and groups"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          aria-label="Search friends and groups"
        />
      </label>
      <ul className="max-h-[50vh] space-y-1 overflow-y-auto pb-2">
        {targets.map((t, i) => {
          const on = picked.has(t.thread);
          const has = had.includes(t.thread);
          const firstFriend = !t.group && (i === 0 || targets[i - 1].group);
          const firstGroup = t.group && i === 0;
          return (
            <li key={t.thread}>
              {(firstGroup || firstFriend) && (
                <p className="px-2 pt-2 pb-1 text-[12px] font-extrabold tracking-wide text-muted uppercase">{t.group ? "Groups" : "Friends"}</p>
              )}
              <button
                onClick={() => toggle(t.thread)}
                aria-pressed={on}
                className={cx("flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors", on ? "bg-[#d9772b]/12" : "active:bg-surface-2")}
              >
                {t.avatar || !t.group ? (
                  <Avatar name={t.name} avatar={t.avatar} size={44} />
                ) : (
                  <span className="grid size-11 place-items-center rounded-full bg-mess-soft text-[20px]">{t.emoji}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{t.name}</span>
                  <span className={cx("block truncate text-[12.5px]", has ? "font-semibold text-[#b85d1c]" : "text-muted")}>
                    {has ? (on ? "Has it — gets the changes" : "Has it — won't get these changes") : t.sub}
                  </span>
                </span>
                <span
                  className={cx(
                    "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    on ? "border-transparent bg-[#d9772b] text-white" : "border-card-edge",
                  )}
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
        {targets.length === 0 && <li className="py-6 text-center text-[13.5px] text-muted">{k ? "Nobody by that name." : "No friends or groups yet."}</li>}
      </ul>
    </>
  );
}

/** A sheet to pick chats and send something to them (a file, a solution…). */
export function PickChats({
  open,
  title,
  onClose,
  onSend,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Resolves when sent; throw to show the message and keep the sheet open. */
  onSend: (threads: ThreadId[]) => Promise<void>;
}) {
  const toast = useToast();
  const targets = useChatTargets();
  const [picked, setPicked] = useState<Set<ThreadId>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (t: ThreadId) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  return (
    <Sheet open={open} onClose={() => !busy && onClose()} title={title}>
      <ChatTargetList targets={targets} picked={picked} toggle={toggle} />
      <button
        onClick={async () => {
          if (!picked.size || busy) return;
          setBusy(true);
          try {
            await onSend([...picked]);
            setPicked(new Set());
          } catch (e) {
            toast.show(e instanceof Error ? e.message : "Could not send it.");
          }
          setBusy(false);
        }}
        disabled={!picked.size || busy}
        className="btn-leather mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] disabled:opacity-50"
      >
        <Send size={17} /> {busy ? "Sending…" : picked.size ? `Send to ${picked.size}` : "Pick who gets it"}
      </button>
    </Sheet>
  );
}
