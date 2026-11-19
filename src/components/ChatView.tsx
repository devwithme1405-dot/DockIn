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
  Copy,
  Download,
  Files,
  Info,
  ListChecks,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Pin,
  Plus,
  RotateCw,
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
  useChatMe,
  useReactionsFor,
  reactMessage,
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
import { Avatar, Sheet, cx, useToast } from "./ui";
import { getSupabase } from "@/lib/supabase";
import { addTask } from "@/lib/repo";

const REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "👀"];

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
  const me = useChatMe() ?? chatMe();
  const reactions = useReactionsFor(thread);
  const [view, setView] = useState<"chat" | "files" | "tasks" | "polls">("chat");
  const [online, setOnline] = useState(0);

  // Who is in this chat right now: Supabase presence (memory only, no database).
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !me) return;
    const ch = sb.channel(`here:${thread}`, { config: { presence: { key: me } } });
    ch.on("presence", { event: "sync" }, () => {
      setOnline(Object.keys(ch.presenceState()).filter((k) => k !== me).length);
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ at: Date.now() });
    });
    return () => {
      void sb.removeChannel(ch);
    };
  }, [thread, me]);
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
    // Messages from one person within a few minutes read as one run: name on
    // the first, time and avatar on the last, tight spacing in between.
    const out: ({ day: string } | { msg: ChatMessage; first: boolean; last: boolean })[] = [];
    const list = (msgs ?? []).filter((m) =>
      view === "chat" ? true : !m.deleted && m.kind === (view === "files" ? "file" : view === "tasks" ? "task" : "poll"),
    );
    let lastDay = "";
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const d = dayLabel(m.createdAt);
      if (d !== lastDay) {
        out.push({ day: d });
        lastDay = d;
      }
      const prev = list[i - 1];
      const next = list[i + 1];
      const joins = (a?: ChatMessage, b?: ChatMessage) =>
        !!a && !!b && a.author === b.author && Math.abs(b.createdAt - a.createdAt) < 5 * 60_000 && dayLabel(a.createdAt) === dayLabel(b.createdAt);
      out.push({ msg: m, first: !joins(prev, m), last: !joins(m, next) });
    }
    return out;
  }, [msgs, view]);

  return (
    <div className="paper-page fixed inset-0 z-50 flex flex-col" role="dialog" aria-label={`Chat with ${title}`}>
      <header className="flex items-center gap-1.5 border-b border-card-edge/70 bg-bg/95 px-1.5 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1.5 backdrop-blur">
        <button onClick={onClose} aria-label="Back" className="grid size-11 place-items-center rounded-full active:bg-surface-2">
          <ArrowLeft size={23} />
        </button>
        {emoji ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mess-soft text-[19px]">{emoji}</span>
        ) : (
          <Avatar name={title} avatar={friendId ? people.get(friendId)?.avatar : undefined} size={40} />
        )}
        <button onClick={onInfo ?? (() => setMenu(true))} className="min-w-0 flex-1 px-1.5 text-left">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[16.5px] font-extrabold">{title}</span>
            {pref?.muted && <BellOff size={14} className="shrink-0 text-muted" aria-label="Muted" />}
          </span>
          <span className="flex items-center gap-1.5 truncate text-[12px] text-muted">
            {online > 0 && <span className="size-2 shrink-0 rounded-full bg-safe" aria-hidden />}
            <span className="truncate">
              {isGroup
                ? `${subtitle ?? ""}${online > 0 ? ` · ${online} online` : ""}`
                : online > 0
                  ? "Online now"
                  : (subtitle ?? "")}
            </span>
          </span>
        </button>
        <button onClick={() => setMenu(true)} aria-label="Chat options" className="grid size-11 place-items-center rounded-full active:bg-surface-2">
          <MoreVertical size={21} />
        </button>
      </header>

      {/* The notebook tab strip: the whole chat, or just its files, tasks or polls. */}
      <div className="px-3 pt-2">
        <nav className="notebook rings flex px-1 pt-3 pb-1" aria-label="Chat sections">
          {(
            [
              ["chat", "Chat", MessageCircle],
              ["files", "Files", Files],
              ["tasks", "Tasks", ListChecks],
              ["polls", "Polls", BarChart3],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-current={view === id ? "page" : undefined}
              className={cx(
                "relative flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 text-[13.5px] font-bold",
                view === id ? "text-mess" : "text-muted",
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
              {view === id && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-orange" />}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3">
        {msgs && rows.length === 0 && view !== "chat" && (
          <p className="mx-auto mt-10 max-w-[16rem] text-center text-[13.5px] text-muted">
            No {view} here yet. Send one with the + button.
          </p>
        )}
        {msgs && msgs.length === 0 && view === "chat" && (
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
              showAvatar={isGroup && r.last && r.msg.author !== me}
              group={isGroup}
              first={r.first}
              last={r.last}
              name={people.get(r.msg.author)?.name ?? "Someone"}
              avatar={people.get(r.msg.author)?.avatar}
              reacts={reactions.get(r.msg.id) ?? []}
              me={me}
              people={people}
              onHold={() => !r.msg.deleted && !r.msg.pending && setHolding(r.msg)}
              onRetry={() => void retryMessage(r.msg)}
            />
          ),
        )}
        <div ref={end} />
      </div>

      {/* Composer: one pill, like a messenger — attach on the left, send appears with text. */}
      <footer className="bg-bg/95 px-3 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] backdrop-blur">
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
        <div className="flex items-end gap-1 rounded-[26px] border-[1.5px] border-card-edge bg-card p-1 focus-within:border-orange/70">
          <button
            onClick={() => setAdding(true)}
            aria-label="Add a task, poll or document"
            disabled={uploading}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange to-[#d9601f] text-white active:scale-95 disabled:opacity-60"
          >
            {uploading ? <Clock size={18} className="animate-pulse" /> : <Plus size={21} strokeWidth={2.5} />}
          </button>
          <textarea
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
            placeholder={uploading ? "Sending the file…" : "Message…"}
            aria-label="Message"
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15.5px] leading-snug outline-none placeholder:text-muted"
          />
          {text.trim() ? (
            <button
              onClick={() => void send()}
              aria-label="Send"
              className="h-10 shrink-0 rounded-full px-3.5 text-[15px] font-extrabold text-mess active:scale-95"
            >
              Send
            </button>
          ) : (
            <button
              onClick={() => docInput.current?.click()}
              aria-label="Send a document"
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted active:scale-95"
            >
              <Paperclip size={20} />
            </button>
          )}
        </div>
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

      <Sheet open={!!holding} onClose={() => setHolding(null)} title="React">
        <div className="flex justify-between gap-1 pb-3">
          {REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => {
                if (holding) void reactMessage(holding.id, e);
                setHolding(null);
              }}
              className="grid size-12 place-items-center rounded-full bg-surface-2 text-[24px] active:scale-90"
              aria-label={`React ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
        {holding?.kind === "text" && holding.body && (
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(holding.body).catch(() => {});
              setHolding(null);
              toast.show("Copied");
            }}
            className="mb-2 flex w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] font-semibold"
          >
            <Copy size={18} className="text-mess" /> Copy text
          </button>
        )}
        {holding?.author === me && (
          <button
            onClick={() => {
              if (holding) void unsendMessage(holding.id);
              setHolding(null);
            }}
            className="flex w-full items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3.5 text-[15px] font-semibold text-danger"
          >
            <Trash2 size={18} /> Delete for everyone
          </button>
        )}
      </Sheet>
    </div>
  );
}

function Bubble({
  m,
  mine,
  showName,
  showAvatar,
  group,
  first,
  last,
  name,
  avatar,
  reacts,
  me,
  people,
  onHold,
  onRetry,
}: {
  m: ChatMessage;
  mine: boolean;
  showName: boolean;
  showAvatar: boolean;
  group: boolean;
  first: boolean;
  last: boolean;
  name: string;
  avatar?: string;
  reacts: { emoji: string; userId: string }[];
  me: string | null;
  people: Map<string, ChatPerson>;
  onHold: () => void;
  onRetry: () => void;
}) {
  const timer = useRef<number | null>(null);
  const press = {
    onPointerDown: () => {
      timer.current = window.setTimeout(onHold, 420);
    },
    onPointerUp: () => timer.current && window.clearTimeout(timer.current),
    onPointerLeave: () => timer.current && window.clearTimeout(timer.current),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onHold();
    },
  };
  const card = !m.deleted && (m.kind === "poll" || m.kind === "task");
  const counts = new Map<string, number>();
  for (const r of reacts) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  const mineReact = reacts.find((r) => r.userId === me)?.emoji;

  return (
    <div className={cx("flex items-end gap-2", mine ? "justify-end" : "justify-start", first ? "mt-3" : "mt-1")}>
      {group && !mine && <span className="w-8 shrink-0">{showAvatar && <Avatar name={name} avatar={avatar} size={32} />}</span>}
      <div className={cx("min-w-0", card ? "w-[84%]" : "max-w-[80%]", mine && "flex flex-col items-end")}>
        <div
          {...press}
          className={cx(
            "px-3.5 py-2 text-[15px] leading-snug [overflow-wrap:anywhere] select-none",
            "shadow-[0_1px_0_rgb(var(--shadow-ink)/0.12),0_4px_12px_-8px_rgb(var(--shadow-ink)/0.35)]",
            mine
              ? cx("border border-orange/30 bg-mess-soft", "rounded-[20px]", !first && "rounded-tr-[7px]", !last && "rounded-br-[7px]")
              : cx("border border-card-edge bg-card", "rounded-[20px]", !first && "rounded-tl-[7px]", !last && "rounded-bl-[7px]"),
            card && "w-full",
            m.deleted && "italic opacity-70",
          )}
        >
          {showName && <p className="mb-0.5 text-[12.5px] font-extrabold text-mess">{name}</p>}
          {m.deleted ? (
            "Message deleted"
          ) : m.kind === "poll" && m.data?.options ? (
            <PollCard m={m} people={people} />
          ) : m.kind === "file" && m.data?.path ? (
            <FileCard f={m.data as ChatFile} />
          ) : m.kind === "task" && m.data ? (
            <TaskCard t={m.data} />
          ) : (
            <span className="whitespace-pre-wrap">{m.body}</span>
          )}
          {(last || m.pending || m.failed) && (
            <span className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-muted">
              {clock(m.createdAt)}
              {mine && (m.failed ? null : m.pending ? <Clock size={11} /> : m.deleted ? null : <CheckCheck size={13} className="text-orange" />)}
            </span>
          )}
        </div>
        {counts.size > 0 && (
          <div className={cx("-mt-1.5 flex gap-1", mine ? "mr-2 justify-end" : "ml-2")}>
            {[...counts].map(([e, n]) => (
              <span
                key={e}
                className={cx(
                  "flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[12.5px] shadow-sm",
                  mineReact === e ? "border-orange" : "border-card-edge",
                )}
              >
                {e}
                {n > 1 && <span className="text-[11.5px] font-bold text-muted">{n}</span>}
              </span>
            ))}
          </div>
        )}
        {m.failed && (
          <button onClick={onRetry} className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-danger">
            <RotateCw size={12} /> Not sent — tap to retry
          </button>
        )}
      </div>
    </div>
  );
}

function TaskCard({ t }: { t: NonNullable<ChatMessage["data"]> }) {
  const toast = useToast();
  const [added, setAdded] = useState(false);
  return (
    <div className="flex items-start gap-3 py-0.5">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border-[1.5px] border-mess text-mess">
        <Check size={18} strokeWidth={2.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-extrabold tracking-wide text-mess uppercase">{KIND_LABEL[t.kind] ?? "Task"}</p>
        <p className="text-[15px] leading-tight font-extrabold">{t.title}</p>
        {t.subject && <p className="truncate text-[12.5px] text-muted">{t.subject}</p>}
        {t.dueDate && (
          <p className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold">
            <CalendarClock size={13} className="text-mess" /> {fmtDay(t.dueDate)}
            {t.dueTime ? ` · ${fmtTime(t.dueTime)}` : ""}
          </p>
        )}
        <button
          onClick={async (e) => {
            e.stopPropagation();
            if (added) return;
            await addTask({ title: t.title, kind: (t.kind as Task["kind"]) ?? "assignment", dueDate: t.dueDate, dueTime: t.dueTime, notes: t.subject ?? "" });
            setAdded(true);
            toast.show("Added to your Tasks");
          }}
          className={cx(
            "mt-2 flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold",
            added ? "border-safe text-safe" : "border-orange/50 text-mess",
          )}
        >
          {added ? <Check size={13} /> : <Plus size={13} />} {added ? "Added to Tasks" : "Add to my Tasks"}
        </button>
      </div>
    </div>
  );
}

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


function PollCard({ m, people }: { m: ChatMessage; people: Map<string, ChatPerson> }) {
  const votes = usePollVotes(m.id);
  const me = chatMe();
  const [who, setWho] = useState(false);
  const opts = m.data?.options ?? [];
  const total = votes.length;
  const myChoice = votes.find((v) => v.userId === me)?.choice;
  return (
    <div className="py-0.5">
      <p className="flex items-center gap-2 text-[15.5px] font-extrabold">
        <BarChart3 size={18} className="shrink-0 text-mess" /> {m.data?.question}
      </p>
      <div className="mt-2.5 space-y-2.5 border-t border-card-edge/70 pt-2.5">
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
              className="flex w-full items-center gap-2.5 text-left"
            >
              <span
                className={cx(
                  "grid size-5 shrink-0 place-items-center rounded-full border-2",
                  picked ? "border-orange bg-orange text-white" : "border-card-edge",
                )}
              >
                {picked && <Check size={12} strokeWidth={3.5} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2 text-[14px] font-semibold">
                  <span className="truncate">{o}</span>
                  <span className="tnum text-[12.5px] text-muted">{n}</span>
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-orange transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 flex items-center justify-between text-[12px] text-muted">
        <span>
          {total} {total === 1 ? "vote" : "votes"}
        </span>
        {total > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setWho(true);
            }}
            className="font-bold text-mess"
          >
            View votes
          </button>
        )}
      </p>
      <Sheet open={who} onClose={() => setWho(false)} title={m.data?.question ?? "Votes"}>
        <div className="space-y-4 pb-2">
          {opts.map((o, i) => {
            const voters = votes.filter((v) => v.choice === i);
            return (
              <div key={i}>
                <p className="mb-1.5 text-[13px] font-bold text-muted">
                  {o} · {voters.length}
                </p>
                {voters.length === 0 ? (
                  <p className="text-[13px] text-muted">Nobody yet</p>
                ) : (
                  <ul className="space-y-1.5">
                    {voters.map((v) => {
                      const p = people.get(v.userId);
                      return (
                        <li key={v.userId} className="flex items-center gap-2.5 text-[14.5px]">
                          <Avatar name={p?.name ?? "Someone"} avatar={p?.avatar} size={28} />
                          {v.userId === me ? "You" : (p?.name ?? "Someone")}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}

const FILE_TINT: Record<string, string> = {
  pdf: "bg-[#c0392b]",
  doc: "bg-[#2b579a]",
  docx: "bg-[#2b579a]",
  ppt: "bg-[#c4532a]",
  pptx: "bg-[#c4532a]",
  xls: "bg-[#217346]",
  xlsx: "bg-[#217346]",
  txt: "bg-[#7a6a5a]",
};

function FileCard({ f }: { f: ChatFile }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
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
      className="my-0.5 flex w-[15.5rem] max-w-full items-center gap-3 rounded-2xl border border-card-edge bg-bg/60 p-2.5 text-left"
    >
      <span className={cx("grid h-11 w-10 shrink-0 place-items-center rounded-lg text-[10.5px] font-extrabold text-white uppercase", FILE_TINT[ext] ?? "bg-[#7a6a5a]")}>
        {ext || "file"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold">{f.name}</span>
        <span className="block text-[12px] text-muted">
          {kb} · {ext.toUpperCase()}
        </span>
      </span>
      {busy ? <Clock size={19} className="shrink-0 animate-pulse text-muted" /> : <Download size={19} className="shrink-0 text-mess" />}
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
