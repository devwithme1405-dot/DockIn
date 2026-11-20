"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Lock, Search, Send, Users } from "lucide-react";
import { db } from "@/lib/db";
import { directThread, groupThread, sendTaskTo, useChatMe, type ThreadId } from "@/lib/chat";
import type { Task } from "@/lib/types";
import { Avatar, Sheet, cx, useToast } from "./ui";

type Target = { thread: ThreadId; name: string; sub: string; avatar?: string; emoji?: string | null; group: boolean };

/**
 * Right after making a task: keep it to yourself, or send it to friends and
 * groups. Everyone it reaches gets it in their Tasks once — even if they are in
 * a group you picked and you also picked them by name.
 */
export function ShareTask({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const toast = useToast();
  const me = useChatMe();
  const [step, setStep] = useState<"ask" | "pick">("ask");
  const [picked, setPicked] = useState<Set<ThreadId>>(() => new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const groups = useLiveQuery(() => db.groups.toArray(), []);
  const friends = useLiveQuery(() => db.friends.filter((f) => f.status === "accepted").toArray(), []);

  const targets = useMemo(() => {
    const k = q.trim().toLowerCase();
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
    return all.filter((t) => !k || t.name.toLowerCase().includes(k));
  }, [groups, friends, me, q]);

  function close() {
    setStep("ask");
    setPicked(new Set());
    setQ("");
    onClose();
  }

  async function send() {
    if (!task || !picked.size) return;
    setBusy(true);
    try {
      const subject = task.subjectId ? (await db.subjects.get(task.subjectId))?.name : null;
      await sendTaskTo([...picked], task, subject);
      toast.show(picked.size === 1 ? "Shared — it's in their Tasks now" : `Shared with ${picked.size} chats — everyone gets it once`);
      close();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not share it.");
    }
    setBusy(false);
  }

  const toggle = (t: ThreadId) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  return (
    <Sheet open={!!task} onClose={close} title={step === "ask" ? "Task added" : "Share with"}>
      {step === "ask" ? (
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
                      <span className="block truncate text-[12.5px] text-muted">{t.sub}</span>
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
            {targets.length === 0 && <li className="py-6 text-center text-[13.5px] text-muted">No friends or groups yet.</li>}
          </ul>
          <button
            onClick={() => void send()}
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
