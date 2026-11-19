"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarClock, Check, CheckCheck, Clock, Info, ListPlus, RotateCw, SendHorizontal, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  type ChatMessage,
  type ChatPerson,
  type ThreadId,
  chatMe,
  markRead,
  retryMessage,
  sendMessage,
  unsendMessage,
  useThread,
} from "@/lib/chat";
import { shareTask, type ShareDraft } from "@/lib/social";
import { lmsRef } from "@/lib/lmsSubmit";
import { fmtDay, fmtTime, toDateStr } from "@/lib/dates";
import type { Task } from "@/lib/types";
import { Sheet, cx, useToast } from "./ui";

const KIND_LABEL: Record<string, string> = {
  assignment: "Assignment",
  exam: "Exam",
  quiz: "Quiz",
  project: "Project",
  todo: "To-do",
  task: "Task",
};

function clock(ms: number): string {
  const d = new Date(ms);
  return fmtTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
}

function dayLabel(ms: number): string {
  const d = toDateStr(new Date(ms));
  const today = toDateStr();
  if (d === today) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d === toDateStr(y)) return "Yesterday";
  return fmtDay(d);
}

/**
 * One conversation, full screen: a friend or a whole group. Messages come from
 * the phone's own copy (instant, offline) and stream in live.
 */
export function ChatView({
  thread,
  title,
  subtitle,
  emoji,
  people,
  groupId,
  friendId,
  onClose,
  onInfo,
}: {
  thread: ThreadId;
  title: string;
  subtitle?: string;
  emoji?: string | null;
  people: Map<string, ChatPerson>;
  groupId?: string | null;
  friendId?: string | null;
  onClose: () => void;
  onInfo?: () => void;
}) {
  const toast = useToast();
  const msgs = useThread(thread);
  const me = chatMe();
  const [text, setText] = useState("");
  const [picking, setPicking] = useState(false);
  const [holding, setHolding] = useState<ChatMessage | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const isGroup = thread.startsWith("g:");

  // Seen: mark read on open and whenever something new arrives while open.
  const count = msgs?.length ?? 0;
  useEffect(() => {
    void markRead(thread);
  }, [thread, count]);

  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function send() {
    const body = text;
    if (!body.trim()) return;
    setText("");
    try {
      await sendMessage(thread, body);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not send.");
    }
  }

  async function shareMine(t: Task) {
    setPicking(false);
    const subject = t.subjectId ? await db.subjects.get(t.subjectId) : null;
    const draft: ShareDraft = {
      title: t.title,
      notes: t.notes,
      kind: t.kind,
      subjectName: subject?.name ?? (t.source === "lms" ? t.notes || null : null),
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      room: t.room,
      priority: t.priority,
      file: null,
      lms: t.source === "lms" ? lmsRef(t.id) : null,
    } as ShareDraft;
    try {
      if (groupId) {
        await shareTask(draft, { groupId });
      } else if (friendId) {
        await shareTask(draft, { friendIds: [friendId] });
        await sendMessage(thread, "", {
          silent: true,
          task: { title: t.title, kind: t.kind, dueDate: t.dueDate, dueTime: t.dueTime, subject: draft.subjectName },
        });
      }
      toast.show("Shared — it's on their task list now");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not share that.");
    }
  }

  const rows = useMemo(() => {
    const out: ({ day: string } | { msg: ChatMessage; first: boolean })[] = [];
    let lastDay = "";
    let lastAuthor = "";
    for (const m of msgs ?? []) {
      const d = dayLabel(m.createdAt);
      if (d !== lastDay) {
        out.push({ day: d });
        lastDay = d;
        lastAuthor = "";
      }
      out.push({ msg: m, first: m.author !== lastAuthor });
      lastAuthor = m.author;
    }
    return out;
  }, [msgs]);

  return (
    <div className="paper-page fixed inset-0 z-50 flex flex-col" role="dialog" aria-label={`Chat with ${title}`}>
      <header className="leather flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-on-ink">
        <button onClick={onClose} aria-label="Back" className="grid size-11 place-items-center rounded-full active:scale-95">
          <ArrowLeft size={22} />
        </button>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 text-[18px] font-bold">
          {emoji ?? title.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16.5px] font-extrabold">{title}</span>
          {subtitle && <span className="block truncate text-[12px] text-ink-muted">{subtitle}</span>}
        </span>
        {onInfo && (
          <button onClick={onInfo} aria-label="Details" className="grid size-11 place-items-center rounded-full active:scale-95">
            <Info size={20} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {msgs && msgs.length === 0 && (
          <p className="mx-auto mt-10 max-w-[16rem] text-center text-[13.5px] text-muted">
            {isGroup ? "Say hi to the group. Tasks anyone shares here show up as cards." : `Start chatting with ${title}.`}
          </p>
        )}
        {rows.map((r) =>
          "day" in r ? (
            <p key={`d-${r.day}`} className="my-3 text-center">
              <span className="rounded-full bg-surface-2 px-3 py-1 text-[11.5px] font-bold text-muted">{r.day}</span>
            </p>
          ) : (
            <Bubble
              key={r.msg.id}
              m={r.msg}
              mine={r.msg.author === me}
              showName={isGroup && r.first && r.msg.author !== me}
              name={people.get(r.msg.author)?.name ?? "Someone"}
              onHold={() => r.msg.author === me && !r.msg.deleted && setHolding(r.msg)}
              onRetry={() => void retryMessage(r.msg)}
            />
          ),
        )}
        <div ref={end} />
      </div>

      <footer className="flex items-end gap-2 border-t border-card-edge/60 bg-bg/90 px-2.5 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button
          onClick={() => setPicking(true)}
          aria-label="Share one of your tasks"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-mess active:scale-95"
        >
          <ListPlus size={20} />
        </button>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message"
          aria-label="Message"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border-[1.5px] border-card-edge bg-card px-4 py-2.5 text-[15px] leading-snug outline-none focus:border-orange"
        />
        <button
          onClick={() => void send()}
          disabled={!text.trim()}
          aria-label="Send"
          className="btn-leather grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-50"
        >
          <SendHorizontal size={19} />
        </button>
      </footer>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Share a task">
        <TaskPicker onPick={(t) => void shareMine(t)} />
      </Sheet>

      <Sheet open={!!holding} onClose={() => setHolding(null)} title="Message">
        <button
          onClick={() => {
            if (holding) void unsendMessage(holding.id);
            setHolding(null);
          }}
          className="flex w-full items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3.5 text-[15px] font-semibold text-danger"
        >
          <Trash2 size={18} /> Delete for everyone
        </button>
      </Sheet>
    </div>
  );
}

function Bubble({
  m,
  mine,
  showName,
  name,
  onHold,
  onRetry,
}: {
  m: ChatMessage;
  mine: boolean;
  showName: boolean;
  name: string;
  onHold: () => void;
  onRetry: () => void;
}) {
  const timer = useRef<number | null>(null);
  const press = {
    onPointerDown: () => {
      timer.current = window.setTimeout(onHold, 450);
    },
    onPointerUp: () => timer.current && window.clearTimeout(timer.current),
    onPointerLeave: () => timer.current && window.clearTimeout(timer.current),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onHold();
    },
  };

  return (
    <div className={cx("mt-1 flex", mine ? "justify-end" : "justify-start")}>
      <div className={cx("max-w-[80%]", showName && "mt-2")}>
        {showName && <p className="mb-0.5 ml-3 text-[12px] font-bold text-mess">{name}</p>}
        <div
          {...press}
          className={cx(
            "rounded-[20px] px-3.5 py-2 text-[15px] leading-snug [overflow-wrap:anywhere] select-none",
            mine ? "rounded-br-md bg-ink text-on-ink" : "rounded-bl-md border-[1.5px] border-card-edge bg-card",
            m.deleted && "italic opacity-70",
          )}
        >
          {m.deleted ? (
            "Message deleted"
          ) : m.kind === "task" && m.data ? (
            <TaskCard t={m.data} mine={mine} />
          ) : (
            <span className="whitespace-pre-wrap">{m.body}</span>
          )}
          <span className={cx("mt-0.5 flex items-center justify-end gap-1 text-[10.5px]", mine ? "text-ink-muted" : "text-muted")}>
            {clock(m.createdAt)}
            {mine && (m.failed ? null : m.pending ? <Clock size={11} /> : m.deleted ? null : <CheckCheck size={12} />)}
          </span>
        </div>
        {m.failed && (
          <button onClick={onRetry} className="mt-1 ml-auto flex items-center gap-1 text-[12px] font-semibold text-danger">
            <RotateCw size={12} /> Not sent — tap to retry
          </button>
        )}
      </div>
    </div>
  );
}

function TaskCard({ t, mine }: { t: NonNullable<ChatMessage["data"]>; mine: boolean }) {
  return (
    <div className="min-w-[13rem]">
      <p className={cx("text-[11px] font-extrabold tracking-wide uppercase", mine ? "text-ink-muted" : "text-mess")}>
        📌 {KIND_LABEL[t.kind] ?? "Task"} shared
      </p>
      <p className="mt-0.5 text-[15px] font-bold">{t.title}</p>
      {t.subject && <p className={cx("text-[12.5px]", mine ? "text-ink-muted" : "text-muted")}>{t.subject}</p>}
      {t.dueDate && (
        <p className={cx("mt-1 flex items-center gap-1 text-[12.5px] font-semibold", mine ? "text-on-ink" : "text-text")}>
          <CalendarClock size={13} /> {fmtDay(t.dueDate)}
          {t.dueTime ? ` · ${fmtTime(t.dueTime)}` : ""}
        </p>
      )}
    </div>
  );
}

/** Your own open tasks, to drop into a chat. */
function TaskPicker({ onPick }: { onPick: (t: Task) => void }) {
  const tasks = useLiveQuery(
    () => db.tasks.filter((t) => !t.deletedAt && !t.done).toArray(),
    [],
  );
  const list = (tasks ?? []).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  if (tasks && list.length === 0)
    return <p className="py-6 text-center text-[14px] text-muted">No open tasks to share. Add one on the Tasks tab.</p>;
  return (
    <ul className="max-h-[60vh] space-y-2 overflow-y-auto pb-2">
      {list.map((t) => (
        <li key={t.id}>
          <button
            onClick={() => onPick(t)}
            className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-card-edge bg-card px-3.5 py-3 text-left active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{t.title}</span>
              <span className="block truncate text-[12.5px] text-muted">
                {KIND_LABEL[t.kind] ?? "Task"}
                {t.dueDate ? ` · ${fmtDay(t.dueDate)}${t.dueTime ? ` ${fmtTime(t.dueTime)}` : ""}` : ""}
                {t.source === "lms" && t.notes ? ` · ${t.notes}` : ""}
              </span>
            </span>
            <Check size={16} className="shrink-0 text-mess" />
          </button>
        </li>
      ))}
    </ul>
  );
}

