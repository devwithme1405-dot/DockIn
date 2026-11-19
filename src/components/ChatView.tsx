"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BellOff,
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Info,
  ListChecks,
  MoreVertical,
  Paperclip,
  Pin,
  Plus,
  RotateCw,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";
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
  CHAT_FILE_TYPES,
  downloadChatFile,
  setThreadPref,
  uploadChatFile,
  usePollVotes,
  votePoll,
  type ChatFile,
} from "@/lib/chat";
import { handOver } from "./AssignmentFile";
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
  const [adding, setAdding] = useState(false);
  const [polling, setPolling] = useState(false);
  const [menu, setMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const docInput = useRef<HTMLInputElement>(null);
  const pref = useLiveQuery(() => db.chatReads.get(thread), [thread]);
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

  function pickAdd(what: "Task" | "Poll" | "Document") {
    setAdding(false);
    if (what === "Task") setPicking(true);
    else if (what === "Poll") setPolling(true);
    else docInput.current?.click();
  }

  async function sendDoc(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    try {
      const file = await uploadChatFile(thread, f);
      await sendMessage(thread, "", { file });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not send that file.");
    }
    setUploading(false);
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
        {pref?.muted && <BellOff size={16} className="shrink-0 text-ink-muted" aria-label="Muted" />}
        <button onClick={() => setMenu(true)} aria-label="Chat options" className="grid size-11 place-items-center rounded-full active:scale-95">
          <MoreVertical size={20} />
        </button>
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
          onClick={() => setAdding(true)}
          aria-label="Add a task, poll or document"
          disabled={uploading}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-mess active:scale-95 disabled:opacity-50"
        >
          {uploading ? <Clock size={19} className="animate-pulse" /> : <Plus size={21} />}
        </button>
        <input
          ref={docInput}
          type="file"
          accept={CHAT_FILE_TYPES}
          className="hidden"
          onChange={(e) => {
            void sendDoc(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
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

      <Sheet open={adding} onClose={() => setAdding(false)} title="Send">
        <div className="grid grid-cols-3 gap-2.5 pb-1">
          {(
            [
              [ListChecks, "Task"],
              [BarChart3, "Poll"],
              [Paperclip, "Document"],
            ] as const
          ).map(([Icon, label]) => (
            <button
              key={label}
              onClick={() => pickAdd(label)}
              className="flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-card-edge bg-card py-4 text-[13.5px] font-bold active:scale-95"
            >
              <span className="grid size-11 place-items-center rounded-full bg-mess-soft text-mess">
                <Icon size={20} />
              </span>
              {label}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={polling} onClose={() => setPolling(false)} title="New poll">
        <PollForm
          onSend={async (poll) => {
            setPolling(false);
            try {
              await sendMessage(thread, "", { poll });
            } catch (e) {
              toast.show(e instanceof Error ? e.message : "Could not send the poll.");
            }
          }}
        />
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title={title}>
        <div className="space-y-2 pb-1">
          <button
            onClick={() => {
              void setThreadPref(thread, { pinned: !pref?.pinned });
              setMenu(false);
              toast.show(pref?.pinned ? "Unpinned" : "Pinned to the top");
            }}
            className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] font-semibold"
          >
            <Pin size={18} className="text-mess" /> {pref?.pinned ? "Unpin chat" : "Pin chat"}
          </button>
          <button
            onClick={() => {
              void setThreadPref(thread, { muted: !pref?.muted });
              setMenu(false);
              toast.show(pref?.muted ? "Notifications on" : "Muted — no notifications from this chat");
            }}
            className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] font-semibold"
          >
            <BellOff size={18} className="text-mess" /> {pref?.muted ? "Unmute" : "Mute notifications"}
          </button>
          {onInfo && (
            <button
              onClick={() => {
                setMenu(false);
                onInfo();
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] font-semibold"
            >
              <Info size={18} className="text-mess" /> Group details
            </button>
          )}
        </div>
      </Sheet>

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
          ) : m.kind === "poll" && m.data?.options ? (
            <PollCard m={m} mine={mine} />
          ) : m.kind === "file" && m.data?.path ? (
            <FileCard f={m.data as ChatFile} mine={mine} />
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


function PollCard({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const votes = usePollVotes(m.id);
  const me = chatMe();
  const opts = m.data?.options ?? [];
  const total = votes.length;
  const myChoice = votes.find((v) => v.userId === me)?.choice;
  return (
    <div className="min-w-[14rem]">
      <p className={cx("text-[11px] font-extrabold tracking-wide uppercase", mine ? "text-ink-muted" : "text-mess")}>📊 Poll</p>
      <p className="mt-0.5 text-[15px] font-bold">{m.data?.question}</p>
      <div className="mt-2 space-y-1.5">
        {opts.map((o, i) => {
          const n = votes.filter((v) => v.choice === i).length;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const picked = myChoice === i;
          return (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                void votePoll(m.id, i);
              }}
              className={cx(
                "relative block w-full overflow-hidden rounded-xl border-[1.5px] px-3 py-2 text-left text-[13.5px] font-semibold",
                mine ? "border-white/25" : "border-card-edge",
                picked && "border-orange",
              )}
            >
              <span
                className={cx("absolute inset-y-0 left-0 transition-[width] duration-300", mine ? "bg-white/15" : "bg-orange/15")}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex items-center gap-2">
                {picked && <Check size={14} strokeWidth={3} className="shrink-0 text-orange" />}
                <span className="min-w-0 flex-1 truncate">{o}</span>
                <span className="tnum text-[12px] opacity-80">{n}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className={cx("mt-1.5 text-[11.5px]", mine ? "text-ink-muted" : "text-muted")}>
        {total} {total === 1 ? "vote" : "votes"} · tap to vote
      </p>
    </div>
  );
}

function FileCard({ f, mine }: { f: ChatFile; mine: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const kb = f.size < 1048576 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1048576).toFixed(1)} MB`;
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          await handOver(await downloadChatFile(f), f.name);
        } catch (err) {
          toast.show(err instanceof Error ? err.message : "Could not open it.");
        }
        setBusy(false);
      }}
      className="flex min-w-[13rem] items-center gap-2.5 text-left"
    >
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", mine ? "bg-white/15" : "bg-mess-soft text-mess")}>
        {busy ? <Clock size={18} className="animate-pulse" /> : <FileText size={19} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold">{f.name}</span>
        <span className={cx("block text-[11.5px]", mine ? "text-ink-muted" : "text-muted")}>
          {kb} · tap to open
        </span>
      </span>
    </button>
  );
}

function PollForm({ onSend }: { onSend: (p: { question: string; options: string[] }) => void }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const ready = q.trim() && opts.filter((o) => o.trim()).length >= 2;
  const input =
    "h-12 w-full rounded-2xl border-[1.5px] border-card-edge bg-card px-4 text-[15px] outline-none focus:border-orange";
  return (
    <div className="space-y-2.5 pb-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask something — e.g. Kal class chal rahe?" className={input} autoFocus />
      {opts.map((o, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={o}
            onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={`Option ${i + 1}`}
            className={input}
          />
          {opts.length > 2 && (
            <button onClick={() => setOpts(opts.filter((_, j) => j !== i))} aria-label="Remove option" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2">
              <X size={16} />
            </button>
          )}
        </div>
      ))}
      {opts.length < 6 && (
        <button onClick={() => setOpts([...opts, ""])} className="flex items-center gap-1.5 px-1 text-[14px] font-bold text-mess">
          <Plus size={16} /> Add option
        </button>
      )}
      <button
        disabled={!ready}
        onClick={() => onSend({ question: q.trim(), options: opts.map((o) => o.trim()).filter(Boolean) })}
        className="btn-leather mt-1 h-12 w-full rounded-2xl text-[15.5px] disabled:opacity-50"
      >
        Send poll
      </button>
    </div>
  );
}
