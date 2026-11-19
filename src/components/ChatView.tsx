"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  BarChart3,
  BellOff,
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  Copy,
  CornerUpLeft,
  Download,
  EyeOff,
  Files,
  Forward,
  ListChecks,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  type ChatFile,
  type ChatMessage,
  type ChatPerson,
  type ThreadId,
  CHAT_FILE_TYPES,
  chatMe,
  directThread,
  downloadChatFile,
  editMessage,
  forwardMessage,
  groupThread,
  hideMessage,
  markRead,
  reactMessage,
  retryMessage,
  sendMessage,
  unsendMessage,
  uploadChatFile,
  useChatMe,
  usePollVotes,
  useReactionsFor,
  useSeenBy,
  useThread,
  votePoll,
} from "@/lib/chat";
import { handOver } from "./AssignmentFile";
import { shareTask, type ShareDraft } from "@/lib/social";
import { lmsRef } from "@/lib/lmsSubmit";
import { fmtDay, fmtTime, toDateStr } from "@/lib/dates";
import type { Group, Task } from "@/lib/types";
import { Avatar, Sheet, cx, useToast } from "./ui";
import { getSupabase } from "@/lib/supabase";
import { addTask } from "@/lib/repo";
import { ChatInfo, PhotoViewer } from "./ChatInfo";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EDIT_WINDOW = 15 * 60_000;

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
  if (d === toDateStr()) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d === toDateStr(y)) return "Yesterday";
  return fmtDay(d);
}

/** One line describing a message, for reply quotes and previews. */
function gist(m: ChatMessage): string {
  if (m.deleted) return "Message deleted";
  if (m.kind === "task") return `📌 ${m.data?.title ?? "Task"}`;
  if (m.kind === "poll") return `📊 ${m.data?.question ?? "Poll"}`;
  if (m.kind === "file") return `📄 ${m.data?.name ?? "Document"}`;
  return m.body;
}

/**
 * A conversation — a friend or a whole group — WhatsApp-style with Instagram
 * touches: swipe a message to reply, double-tap to ❤️, hold for react / reply /
 * copy / forward / edit / delete, typing and online, ✓✓ seen, an unread line,
 * a jump-to-latest button, and a full info page behind the name.
 */
export function ChatView({
  thread,
  title,
  subtitle,
  emoji,
  avatar,
  people,
  group,
  friendId,
  onClose,
  onLeft,
}: {
  thread: ThreadId;
  title: string;
  subtitle?: string;
  emoji?: string | null;
  avatar?: string | null;
  people: Map<string, ChatPerson>;
  group?: Group | null;
  friendId?: string | null;
  onClose: () => void;
  onLeft?: () => void;
}) {
  const toast = useToast();
  const msgs = useThread(thread);
  const me = useChatMe() ?? chatMe();
  const reactions = useReactionsFor(thread);
  const seenBy = useSeenBy(thread);
  const pref = useLiveQuery(() => db.chatReads.get(thread), [thread]);
  const isGroup = thread.startsWith("g:");
  const groupId = group?.id ?? (isGroup ? thread.slice(2) : null);

  const [text, setText] = useState("");
  const [view, setView] = useState<"chat" | "files" | "tasks" | "polls">("chat");
  const [online, setOnline] = useState(0);
  const [typing, setTyping] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [holding, setHolding] = useState<ChatMessage | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [polling, setPolling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [info, setInfo] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [finding, setFinding] = useState(false);
  const [find, setFind] = useState("");
  const docInput = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const channel = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabase>>["channel"]> | null>(null);
  const lastTyped = useRef(0);
  // Where "new messages" begins: your read mark at the moment you opened it.
  const [openedAt] = useState(() => Date.now());
  const readAtOpen = useLiveQuery(async () => (await db.chatReads.get(thread))?.readAt ?? 0, [thread]);
  const [unreadFrom, setUnreadFrom] = useState<number | null>(null);
  if (unreadFrom === null && readAtOpen !== undefined) setUnreadFrom(readAtOpen || openedAt);

  // Presence (online) and typing — Supabase realtime in memory, no database rows.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !me) return;
    const ch = sb.channel(`here:${thread}`, { config: { presence: { key: me } } });
    channel.current = ch;
    const timers = new Map<string, number>();
    ch.on("presence", { event: "sync" }, () => {
      setOnline(Object.keys(ch.presenceState()).filter((k) => k !== me).length);
    })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = (payload as { user?: string })?.user;
        if (!who || who === me) return;
        setTyping((t) => (t.includes(who) ? t : [...t, who]));
        window.clearTimeout(timers.get(who));
        timers.set(
          who,
          window.setTimeout(() => setTyping((t) => t.filter((x) => x !== who)), 3500),
        );
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void ch.track({ at: Date.now() });
      });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      channel.current = null;
      void sb.removeChannel(ch);
    };
  }, [thread, me]);

  // Seen: mark read on open and whenever something new arrives while open.
  const count = msgs?.length ?? 0;
  useEffect(() => {
    void markRead(thread);
  }, [thread, count]);

  // Stick to the bottom as messages arrive, unless you scrolled up to read.
  useLayoutEffect(() => {
    if (atBottom) end.current?.scrollIntoView({ block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, view]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  }

  function typed(v: string) {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyped.current > 2000) {
      lastTyped.current = now;
      void channel.current?.send({ type: "broadcast", event: "typing", payload: { user: me } });
    }
    const el = field.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    if (field.current) field.current.style.height = "auto";
    if (editing) {
      const m = editing;
      setEditing(null);
      await editMessage(m.id, body);
      return;
    }
    const quoted = replyTo;
    setReplyTo(null);
    setAtBottom(true);
    try {
      await sendMessage(thread, body, { replyTo: quoted?.id ?? null });
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
    const draft = {
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

  const byId = useMemo(() => new Map((msgs ?? []).map((m) => [m.id, m])), [msgs]);
  const others = group ? Math.max(1, group.members - 1) : 1;
  /** ✓✓ turns orange once everyone else has read up to this message. */
  const seenAll = (m: ChatMessage) => {
    let n = 0;
    seenBy.forEach((at) => {
      if (at >= m.createdAt) n += 1;
    });
    return n >= others;
  };
  const lastMine = useMemo(() => [...(msgs ?? [])].reverse().find((m) => m.author === me && !m.deleted), [msgs, me]);

  const rows = useMemo(() => {
    const q = find.trim().toLowerCase();
    const list = (msgs ?? []).filter(
      (m) =>
        (view === "chat" || (!m.deleted && m.kind === (view === "files" ? "file" : view === "tasks" ? "task" : "poll"))) &&
        (!q || gist(m).toLowerCase().includes(q)),
    );
    const out: ({ day: string } | { unread: true } | { msg: ChatMessage; first: boolean; last: boolean })[] = [];
    let lastDay = "";
    let marked = false;
    const joins = (a?: ChatMessage, b?: ChatMessage) =>
      !!a && !!b && a.author === b.author && Math.abs(b.createdAt - a.createdAt) < 5 * 60_000 && dayLabel(a.createdAt) === dayLabel(b.createdAt);
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const d = dayLabel(m.createdAt);
      if (d !== lastDay) {
        out.push({ day: d });
        lastDay = d;
      }
      if (!marked && view === "chat" && !q && unreadFrom !== null && m.author !== me && m.createdAt > unreadFrom) {
        out.push({ unread: true });
        marked = true;
      }
      out.push({ msg: m, first: !joins(list[i - 1], m), last: !joins(m, list[i + 1]) });
    }
    return out;
  }, [msgs, view, find, unreadFrom, me]);

  const status = typing.length
    ? isGroup
      ? `${typing.map((u) => people.get(u)?.name?.split(" ")[0] ?? "Someone").join(", ")} typing…`
      : "typing…"
    : isGroup
      ? `${subtitle ?? ""}${online > 0 ? ` · ${online} online` : ""}`
      : online > 0
        ? "online"
        : (subtitle ?? "");

  return (
    <div className="paper-page fixed inset-0 z-50 flex flex-col" role="dialog" aria-label={`Chat with ${title}`}>
      <header className="glass-bar relative z-10 flex items-center gap-1 px-1.5 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1.5">
        <button onClick={onClose} aria-label="Back" className="grid size-11 place-items-center rounded-full active:bg-surface-2">
          <ArrowLeft size={23} />
        </button>
        <button onClick={() => setPhoto(true)} aria-label="View photo" className="shrink-0 rounded-full">
          {avatar || !isGroup ? (
            <Avatar name={title} avatar={avatar ?? undefined} size={40} />
          ) : (
            <span className="grid size-10 place-items-center rounded-full bg-mess-soft text-[19px]">{emoji ?? "👥"}</span>
          )}
        </button>
        <button onClick={() => setInfo(true)} className="min-w-0 flex-1 px-2 text-left" aria-label={`${title} info`}>
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[16.5px] font-extrabold">{title}</span>
            {pref?.muted && <BellOff size={14} className="shrink-0 text-muted" aria-label="Muted" />}
          </span>
          <span className={cx("flex items-center gap-1.5 truncate text-[12px]", typing.length ? "font-bold text-orange" : "text-muted")}>
            {!typing.length && online > 0 && <span className="size-2 shrink-0 rounded-full bg-safe" aria-hidden />}
            <span className="truncate">{status || "tap for info"}</span>
          </span>
        </button>
        <button
          onClick={() => {
            setFinding((v) => !v);
            setFind("");
          }}
          aria-label="Search in chat"
          className="grid size-11 place-items-center rounded-full active:bg-surface-2"
        >
          <Search size={20} />
        </button>
      </header>

      {/* Sections as a frosted pill row floating over the chat. */}
      <div className="absolute inset-x-0 top-[calc(max(0.4rem,env(safe-area-inset-top))+3.6rem)] z-10 px-3">
        {finding ? (
          <label className="glass-pill flex h-11 items-center gap-2 rounded-2xl px-3.5">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              autoFocus
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Search messages"
              aria-label="Search messages"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
            />
            <button onClick={() => { setFinding(false); setFind(""); }} aria-label="Close search" className="text-muted">
              <X size={17} />
            </button>
          </label>
        ) : (
          <nav className="glass-pill flex gap-0.5 rounded-2xl p-1" aria-label="Chat sections">
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
                  "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold transition",
                  view === id ? "bg-ink text-on-ink shadow-sm" : "text-muted",
                )}
              >
                <Icon size={15} className="shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain px-3 pt-16 pb-3">
        {msgs && rows.length === 0 && (
          <p className="mx-auto mt-10 max-w-[16rem] text-center text-[13.5px] text-muted">
            {find ? "No messages match." : view !== "chat" ? `No ${view} here yet. Send one with the + button.` : isGroup ? "Say hi to the group 👋" : `Say hi to ${title} 👋`}
          </p>
        )}
        {rows.map((r, i) =>
          "day" in r ? (
            <p key={`d-${r.day}-${i}`} className="sticky top-14 z-[1] my-3 text-center">
              <span className="glass-pill rounded-full px-3 py-1 text-[11.5px] font-bold text-muted">{r.day}</span>
            </p>
          ) : "unread" in r ? (
            <p key="unread" className="my-3 text-center">
              <span className="rounded-full bg-orange/15 px-3 py-1 text-[11.5px] font-extrabold text-mess">Unread messages</span>
            </p>
          ) : (
            <Bubble
              key={r.msg.id}
              m={r.msg}
              quoted={r.msg.replyTo ? byId.get(r.msg.replyTo) : undefined}
              quotedName={(id) => (id === me ? "You" : (people.get(id)?.name ?? "Someone"))}
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
              seen={r.msg.author === me && seenAll(r.msg)}
              seenLabel={!isGroup && r.msg.id === lastMine?.id && seenAll(r.msg)}
              onHold={() => {
                if (r.msg.pending) return;
                setHolding(r.msg);
                setCanEdit(r.msg.author === me && r.msg.kind === "text" && !r.msg.deleted && Date.now() - r.msg.createdAt < EDIT_WINDOW);
              }}
              onReply={() => {
                if (r.msg.deleted) return;
                setReplyTo(r.msg);
                field.current?.focus();
              }}
              onLike={() => void reactMessage(r.msg.id, "❤️")}
              onRetry={() => void retryMessage(r.msg)}
            />
          ),
        )}
        {typing.length > 0 && view === "chat" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="glass-card flex gap-1 rounded-[18px] px-3.5 py-3" aria-label="Typing">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-mess" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </span>
          </div>
        )}
        <div ref={end} />
      </div>

      {!atBottom && (
        <button
          onClick={() => {
            setAtBottom(true);
            end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          }}
          aria-label="Jump to latest"
          className="glass-pill absolute right-4 bottom-[calc(5.2rem+env(safe-area-inset-bottom))] z-10 grid size-11 place-items-center rounded-full text-mess"
        >
          <ArrowDown size={20} />
        </button>
      )}

      <footer className="glass-bar border-t border-b-0 border-card-edge/60 px-3 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        {(replyTo || editing) && (
          <div className="mb-1.5 flex items-center gap-2.5 rounded-2xl bg-card/80 px-3 py-2">
            <span className="h-9 w-1 shrink-0 rounded-full bg-orange" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-extrabold text-mess">
                {editing ? "Edit message" : replyTo!.author === me ? "Replying to yourself" : `Replying to ${people.get(replyTo!.author)?.name ?? "Someone"}`}
              </span>
              <span className="block truncate text-[13px] text-muted">{gist((editing ?? replyTo)!)}</span>
            </span>
            <button
              onClick={() => {
                setReplyTo(null);
                if (editing) {
                  setEditing(null);
                  setText("");
                }
              }}
              aria-label="Cancel"
              className="grid size-8 place-items-center rounded-full text-muted"
            >
              <X size={17} />
            </button>
          </div>
        )}
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
            ref={field}
            rows={1}
            value={text}
            onChange={(e) => typed(e.target.value)}
            placeholder={uploading ? "Sending the file…" : `Message ${isGroup ? title : ""}`.trim() + "…"}
            aria-label="Message"
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15.5px] leading-snug outline-none placeholder:text-muted"
          />
          {text.trim() ? (
            <button onClick={() => void send()} aria-label="Send" className="h-10 shrink-0 rounded-full px-3.5 text-[15px] font-extrabold text-mess active:scale-95">
              {editing ? "Save" : "Send"}
            </button>
          ) : (
            <button onClick={() => docInput.current?.click()} aria-label="Send a document" className="grid size-10 shrink-0 place-items-center rounded-full text-muted active:scale-95">
              <Paperclip size={20} />
            </button>
          )}
        </div>
      </footer>

      {/* Hold a message: react, reply, copy, forward, edit, delete. */}
      <Sheet open={!!holding} onClose={() => setHolding(null)} title="Message">
        {holding && !holding.deleted && (
          <div className="flex justify-between gap-1 pb-3">
            {REACTIONS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  void reactMessage(holding.id, e);
                  setHolding(null);
                }}
                className="grid size-12 place-items-center rounded-full bg-surface-2 text-[24px] active:scale-90"
                aria-label={`React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="overflow-hidden rounded-2xl bg-surface-2">
          {holding && !holding.deleted && (
            <SheetRow icon={CornerUpLeft} label="Reply" onClick={() => { setReplyTo(holding); setHolding(null); field.current?.focus(); }} />
          )}
          {holding?.kind === "text" && !holding.deleted && (
            <SheetRow
              icon={Copy}
              label="Copy"
              onClick={() => {
                void navigator.clipboard?.writeText(holding.body).catch(() => {});
                setHolding(null);
                toast.show("Copied");
              }}
            />
          )}
          {holding && !holding.deleted && (
            <SheetRow icon={Forward} label="Forward" onClick={() => { setForwarding(holding); setHolding(null); }} />
          )}
          {holding && canEdit && (
            <SheetRow
              icon={Pencil}
              label="Edit"
              onClick={() => {
                setEditing(holding);
                setReplyTo(null);
                setText(holding.body);
                setHolding(null);
                window.setTimeout(() => field.current?.focus(), 50);
              }}
            />
          )}
          {holding && (
            <SheetRow icon={EyeOff} label="Delete for me" onClick={() => { void hideMessage(holding.id); setHolding(null); }} />
          )}
          {holding?.author === me && !holding.deleted && (
            <SheetRow icon={Trash2} danger label="Delete for everyone" onClick={() => { void unsendMessage(holding.id); setHolding(null); }} />
          )}
        </div>
      </Sheet>

      <Sheet open={!!forwarding} onClose={() => setForwarding(null)} title="Forward to">
        <ForwardList
          me={me}
          current={thread}
          onPick={async (to, label) => {
            const m = forwarding;
            setForwarding(null);
            if (!m) return;
            try {
              await forwardMessage(m, to);
              toast.show(`Forwarded to ${label}`);
            } catch (e) {
              toast.show(e instanceof Error ? e.message : "Could not forward.");
            }
          }}
        />
      </Sheet>

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

      <Sheet open={picking} onClose={() => setPicking(false)} title="Share a task">
        <TaskPicker onPick={(t) => void shareMine(t)} />
      </Sheet>

      {photo && <PhotoViewer name={title} avatar={avatar ?? (isGroup ? null : undefined)} emoji={isGroup ? emoji : null} onClose={() => setPhoto(false)} />}
      {info && (
        <ChatInfo
          thread={thread}
          me={me}
          group={group}
          friendId={friendId}
          title={title}
          avatar={avatar}
          onClose={() => setInfo(false)}
          onShowFiles={() => {
            setInfo(false);
            setView("files");
          }}
          onLeft={() => {
            setInfo(false);
            (onLeft ?? onClose)();
          }}
        />
      )}
    </div>
  );
}

function SheetRow({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-3.5 border-b border-card-edge/40 px-4 py-3.5 text-left text-[15px] font-semibold last:border-b-0 active:bg-card",
        danger && "text-danger",
      )}
    >
      <Icon size={19} className={danger ? "" : "text-mess"} /> {label}
    </button>
  );
}

/** Every chat you could forward into: groups first, then friends. */
function ForwardList({ me, current, onPick }: { me: string | null; current: ThreadId; onPick: (to: ThreadId, label: string) => void }) {
  const groups = useLiveQuery(() => db.groups.toArray(), []);
  const friends = useLiveQuery(() => db.friends.filter((f) => f.status === "accepted").toArray(), []);
  const items = [
    ...(groups ?? []).map((g) => ({ thread: groupThread(g.id), name: g.name, avatar: g.photo ?? undefined, emoji: g.emoji ?? "👥" })),
    ...(friends ?? []).map((f) => ({ thread: me ? directThread(me, f.id) : "", name: f.name, avatar: f.avatar, emoji: null as string | null })),
  ].filter((x) => x.thread && x.thread !== current);
  if (!items.length) return <p className="py-6 text-center text-[14px] text-muted">No other chats yet.</p>;
  return (
    <ul className="max-h-[60vh] space-y-1 overflow-y-auto pb-2">
      {items.map((x) => (
        <li key={x.thread}>
          <button onClick={() => onPick(x.thread, x.name)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-surface-2">
            {x.avatar ? (
              <Avatar name={x.name} avatar={x.avatar} size={44} />
            ) : (
              <span className="grid size-11 place-items-center rounded-full bg-mess-soft text-[20px]">{x.emoji ?? x.name.charAt(0)}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{x.name}</span>
            <Forward size={17} className="text-mess" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Bubble({
  m,
  quoted,
  quotedName,
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
  seen,
  seenLabel,
  onHold,
  onReply,
  onLike,
  onRetry,
}: {
  m: ChatMessage;
  quoted?: ChatMessage;
  quotedName: (id: string) => string;
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
  seen: boolean;
  seenLabel: boolean;
  onHold: () => void;
  onReply: () => void;
  onLike: () => void;
  onRetry: () => void;
}) {
  const hold = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const [dx, setDx] = useState(0);

  // Swipe right to reply (WhatsApp); hold for the menu; double-tap to ❤️ (Instagram).
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
      hold.current = window.setTimeout(() => {
        start.current = null;
        setDx(0);
        onHold();
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s) return;
      const x = e.clientX - s.x;
      if (Math.abs(e.clientY - s.y) > 12 || Math.abs(x) > 8) window.clearTimeout(hold.current ?? 0);
      if (Math.abs(e.clientY - s.y) > 24) {
        start.current = null;
        setDx(0);
        return;
      }
      if (x > 0) setDx(Math.min(x, 80));
    },
    onPointerUp: () => {
      window.clearTimeout(hold.current ?? 0);
      if (dx > 56) {
        navigator.vibrate?.(12);
        onReply();
      } else if (dx < 6 && start.current) {
        const now = Date.now();
        if (now - lastTap.current < 300 && !m.deleted) {
          navigator.vibrate?.(10);
          onLike();
          lastTap.current = 0;
        } else lastTap.current = now;
      }
      start.current = null;
      setDx(0);
    },
    onPointerCancel: () => {
      window.clearTimeout(hold.current ?? 0);
      start.current = null;
      setDx(0);
    },
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
    <div className={cx("relative flex items-end gap-2", mine ? "justify-end" : "justify-start", first ? "mt-3" : "mt-1")}>
      {dx > 10 && (
        <span className="absolute top-1/2 left-1 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-orange/15 text-mess" style={{ opacity: Math.min(1, dx / 56) }}>
          <CornerUpLeft size={16} />
        </span>
      )}
      {group && !mine && <span className="w-8 shrink-0">{showAvatar && <Avatar name={name} avatar={avatar} size={32} />}</span>}
      <div
        className={cx("min-w-0 touch-pan-y", card ? "w-[84%]" : "max-w-[80%]", mine && "flex flex-col items-end")}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform 180ms ease-out" }}
      >
        <div
          {...handlers}
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
          {quoted && !m.deleted && (
            <div className="mb-1.5 flex gap-2 rounded-xl bg-bg/60 px-2.5 py-1.5">
              <span className="w-[3px] shrink-0 rounded-full bg-orange" />
              <span className="min-w-0">
                <span className="block text-[12px] font-extrabold text-mess">{quotedName(quoted.author)}</span>
                <span className="block truncate text-[12.5px] text-muted">{gist(quoted)}</span>
              </span>
            </div>
          )}
          {m.deleted ? (
            <span className="flex items-center gap-1.5 text-muted">
              <Trash2 size={13} /> This message was deleted
            </span>
          ) : m.kind === "poll" && m.data?.options ? (
            <PollCard m={m} people={people} />
          ) : m.kind === "file" && m.data?.path ? (
            <FileCard f={m.data as ChatFile} />
          ) : m.kind === "task" && m.data ? (
            <TaskCard t={m.data} />
          ) : (
            <span className="whitespace-pre-wrap">{m.body}</span>
          )}
          {(last || m.pending || m.failed || m.editedAt) && (
            <span className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-muted">
              {m.editedAt && !m.deleted && <span className="italic">edited ·</span>}
              {clock(m.createdAt)}
              {mine &&
                !m.deleted &&
                !m.failed &&
                (m.pending ? <Clock size={11} /> : seen ? <CheckCheck size={14} className="text-orange" /> : <Check size={13} />)}
            </span>
          )}
        </div>
        {counts.size > 0 && (
          <div className={cx("-mt-1.5 flex gap-1", mine ? "mr-2 justify-end" : "ml-2")}>
            {[...counts].map(([e, n]) => (
              <span
                key={e}
                className={cx("flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[12.5px] shadow-sm", mineReact === e ? "border-orange" : "border-card-edge")}
              >
                {e}
                {n > 1 && <span className="text-[11.5px] font-bold text-muted">{n}</span>}
              </span>
            ))}
          </div>
        )}
        {seenLabel && <p className="mt-0.5 mr-1 text-[11px] font-semibold text-muted">Seen</p>}
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
