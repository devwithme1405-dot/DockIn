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
  Paperclip,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  X,
  FileCheck,
  MoreVertical,
  Star,
  Palette,
  Eye,
  Info,
  SendHorizontal,
  Bell,
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
  sendTaskTo,
  useFileCached,
  editMessage,
  forwardMessage,
  groupThread,
  hideMessage,
  markRead,
  reactMessage,
  retryMessage,
  sendMessage,
  setThreadPref,
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
import { SendDocSheet, SolutionCard } from "./SolutionStudio";
import { docKind } from "@/lib/solution";
import { TaskForm } from "./TaskParts";
import { fmtDay, fmtTime, toDateStr } from "@/lib/dates";
import type { Group, Task } from "@/lib/types";
import { Avatar, Sheet, cx, useToast } from "./ui";
import { getSupabase } from "@/lib/supabase";
import { addTask } from "@/lib/repo";
import { ChatInfo, PhotoViewer } from "./ChatInfo";
import { Bone } from "./Skeleton";
import { chatVars, useChatLook, useChatPhoto } from "@/lib/chatLook";
import { ChatLookSheet } from "./ChatLook";

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
  leaving = false,
  onClose,
  onLeft,
}: {
  thread: ThreadId;
  /** Closing: plays the slide-out before it unmounts. */
  leaving?: boolean;
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
  const [menu, setMenu] = useState(false);
  const [looking, setLooking] = useState(false);
  const [starredOpen, setStarredOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [leftAt, setLeftAt] = useState<number | null>(null);
  const look = useChatLook(thread);
  const picture = useChatPhoto();
  const appDark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  const paint = chatVars(look, appDark, look.wallpaper === "photo" ? picture : null);
  const starred = useLiveQuery(() => db.starred.where("thread").equals(thread).toArray(), [thread]);
  const starSet = useMemo(() => new Set((starred ?? []).map((x) => x.id)), [starred]);
  const docInput = useRef<HTMLInputElement>(null);
  const [docAsk, setDocAsk] = useState<File | null>(null);
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
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (!bottom && atBottom) setLeftAt(Date.now());
    if (bottom && !atBottom) setLeftAt(null);
    setAtBottom(bottom);
  }

  /** Scroll to a message (a reply's original, a starred one) and make it glow. */
  function jumpTo(id: string) {
    setView("chat");
    setFind("");
    setFinding(false);
    window.setTimeout(() => {
      const el = document.getElementById(`msg-${id}`);
      if (!el) {
        toast.show("That message isn't loaded here anymore.");
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlash(id);
      window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1500);
    }, 60);
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
    // A Word file or PDF might be someone's assignment solution: ask first.
    if (docKind(f.name, f.type)) {
      setDocAsk(f);
      return;
    }
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
    try {
      const subject = t.subjectId ? (await db.subjects.get(t.subjectId))?.name : null;
      await sendTaskTo([thread], t, subject ?? (t.source === "lms" ? t.notes || null : null));
      toast.show(isGroup ? "Sent — it's in everyone's Tasks now" : "Sent — it's in their Tasks now");
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

  const missed = leftAt ? (msgs ?? []).filter((m) => m.createdAt > leftAt && m.author !== me).length : 0;
  // In a group, "@" opens a list of members to mention.
  const mentionAt = isGroup ? /(?:^|\s)@([\p{L}]*)$/u.exec(text) : null;
  const mentionList = mentionAt
    ? [...people.entries()]
        .filter(([id, p]) => id !== me && p.name.toLowerCase().startsWith(mentionAt[1].toLowerCase()))
        .slice(0, 5)
    : [];
  const TABS = [
    ["chat", "Chat"],
    ["files", "Files"],
    ["tasks", "Tasks"],
    ["polls", "Polls"],
  ] as const;

  return (
    <div
      className={cx("chat-root fixed inset-0 z-50 flex flex-col text-text", leaving ? "chat-out pointer-events-none" : "chat-in")}
      data-theme={paint.dark ? "dark" : "light"}
      {...paint.attrs}
      style={paint.style}
      role="dialog"
      aria-label={`Chat with ${title}`}
    >
      <header className="chat-head relative z-10 pt-[max(0.4rem,var(--sat))]">
        <div className="flex items-center gap-1 px-1.5 pb-1">
          <button onClick={onClose} aria-label="Back" className="grid size-11 place-items-center rounded-full active:bg-black/5">
            <ArrowLeft size={23} />
          </button>
          <button onClick={() => setPhoto(true)} aria-label="View photo" className="shrink-0 rounded-full">
            {avatar || !isGroup ? (
              <Avatar name={title} avatar={avatar ?? undefined} size={40} />
            ) : (
              <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-[19px]">{emoji ?? "👥"}</span>
            )}
          </button>
          <button onClick={() => setInfo(true)} className="min-w-0 flex-1 px-2 text-left" aria-label={`${title} info`}>
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[16.5px] font-extrabold">{title}</span>
              {pref?.muted && <BellOff size={14} className="shrink-0 text-muted" aria-label="Muted" />}
            </span>
            <span className={cx("flex items-center gap-1.5 truncate text-[12.5px]", typing.length || online > 0 ? "chat-accent font-semibold" : "text-muted")}>
              {!typing.length && online > 0 && <span className="size-2 shrink-0 rounded-full bg-[var(--chat-accent)]" aria-hidden />}
              <span className="truncate">{status || "tap for info"}</span>
            </span>
          </button>
          <button
            onClick={() => {
              setFinding((v) => !v);
              setFind("");
            }}
            aria-label="Search in chat"
            className="grid size-11 place-items-center rounded-full active:bg-black/5"
          >
            <Search size={20} />
          </button>
          <button onClick={() => setMenu(true)} aria-label="Chat menu" className="grid size-11 place-items-center rounded-full active:bg-black/5">
            <MoreVertical size={20} />
          </button>
        </div>
        {finding ? (
          <div className="px-3 pb-2.5">
            <label className="chat-input flex h-10 items-center gap-2 rounded-full px-3.5 ring-1 ring-black/10">
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
          </div>
        ) : (
          <nav className="flex px-2" aria-label="Chat sections">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className={cx("relative flex-1 pt-1.5 pb-2.5 text-[13.5px] font-bold transition-colors", view === id ? "chat-accent" : "text-muted")}
              >
                {label}
                <span
                  className={cx(
                    "absolute inset-x-5 bottom-0 h-[3px] rounded-t-full bg-[var(--chat-accent)] transition-transform duration-200",
                    view === id ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </button>
            ))}
          </nav>
        )}
      </header>

      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain px-2.5 pt-2 pb-3">
        {msgs === undefined && (
          <div className="space-y-3 pt-3" role="status" aria-label="Loading messages">
            {[["w-1/2", false], ["w-2/3", true], ["w-2/5", false], ["w-1/2", true], ["w-3/5", false]].map(([w, mine], i) => (
              <div key={i} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                <Bone className={cx("h-11 rounded-[18px]", w as string)} />
              </div>
            ))}
          </div>
        )}
        {msgs && rows.length === 0 && (
          <div className="mx-auto mt-10 max-w-[17rem] text-center">
            <p className="chat-chip inline-block rounded-2xl px-4 py-3 text-[13.5px] leading-snug">
              {find ? "No messages match." : view !== "chat" ? `No ${view} here yet. Send one with the + button.` : isGroup ? "This is the start of the group. Say hi 👋" : `This is the start of your chat with ${title}. Say hi 👋`}
            </p>
          </div>
        )}
        {rows.map((r, i) =>
          "day" in r ? (
            <p key={`d-${r.day}-${i}`} className="my-3 text-center">
              <span className="chat-chip rounded-full px-3 py-1 text-[12px] font-bold">{r.day}</span>
            </p>
          ) : "unread" in r ? (
            <p key="unread" className="my-3 text-center">
              <span className="chat-chip chat-accent rounded-full px-3 py-1 text-[12px] font-extrabold">Unread messages</span>
            </p>
          ) : (
            <Bubble
              key={r.msg.id}
              m={r.msg}
              quoted={r.msg.replyTo ? byId.get(r.msg.replyTo) : undefined}
              quotedName={(id) => (id === me ? "You" : (people.get(id)?.name ?? "Someone"))}
              mine={r.msg.author === me}
              showName={isGroup && r.first && r.msg.author !== me}
              showAvatar={look.avatars && isGroup && r.last && r.msg.author !== me}
              avatarSpace={look.avatars && isGroup}
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
              fresh={r.msg.createdAt > openedAt}
              starred={starSet.has(r.msg.id)}
              flash={flash === r.msg.id}
              myName={me ? (people.get(me)?.name ?? "") : ""}
              onJump={jumpTo}
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
            <span className="bubble-in flex gap-1 rounded-[var(--r)] px-3.5 py-3" aria-label="Typing">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-[var(--in-meta)]" style={{ animationDelay: `${d * 150}ms` }} />
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
            setLeftAt(null);
            end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          }}
          aria-label="Jump to latest"
          className="chat-chip anim-pop absolute right-3 bottom-[calc(5rem+var(--sab))] z-10 grid size-11 place-items-center rounded-full"
        >
          <ArrowDown size={20} />
          {missed > 0 && (
            <span className="chat-accent-bg absolute -top-1.5 -right-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold">
              {missed > 99 ? "99+" : missed}
            </span>
          )}
        </button>
      )}

      <footer className="chat-head px-2.5 pt-2 pb-[calc(max(0.5rem,var(--sab))+0.4rem)]">
        {mentionList.length > 0 && (
          <ul className="mb-1.5 overflow-hidden rounded-2xl bg-[var(--chat-input)] ring-1 ring-black/10">
            {mentionList.map(([id, p]) => (
              <li key={id}>
                <button
                  onClick={() => {
                    const first = p.name.split(" ")[0];
                    setText(text.replace(/@([\p{L}]*)$/u, `@${first} `));
                    field.current?.focus();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left active:bg-black/5"
                >
                  <Avatar name={p.name} avatar={p.avatar} size={30} />
                  <span className="truncate text-[14.5px] font-semibold">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {(replyTo || editing) && (
          <div className="mb-1.5 flex items-center gap-2.5 rounded-2xl bg-[var(--chat-input)] px-3 py-2 ring-1 ring-black/5">
            <span className="h-9 w-[3px] shrink-0 rounded-full bg-[var(--chat-accent)]" />
            <span className="min-w-0 flex-1">
              <span className="chat-accent block text-[12.5px] font-extrabold">
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
        <div className="flex items-end gap-1.5">
          <div className="chat-input flex min-h-11 flex-1 items-end rounded-[22px] ring-1 ring-black/10">
            <button
              onClick={() => setAdding(true)}
              aria-label="Add a task, poll or document"
              disabled={uploading}
              className="chat-accent grid size-11 shrink-0 place-items-center rounded-full active:scale-90 disabled:opacity-60"
            >
              {uploading ? <Clock size={19} className="animate-pulse" /> : <Plus size={23} strokeWidth={2.4} />}
            </button>
            <textarea
              ref={field}
              rows={1}
              value={text}
              onChange={(e) => typed(e.target.value)}
              placeholder={uploading ? "Sending the file…" : "Message"}
              aria-label="Message"
              className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-[11px] pr-2 text-[16px] leading-snug outline-none placeholder:text-muted"
            />
            {!text.trim() && (
              <button onClick={() => docInput.current?.click()} aria-label="Send a document" className="grid size-11 shrink-0 place-items-center rounded-full text-muted active:scale-90">
                <Paperclip size={20} />
              </button>
            )}
          </div>
          <button
            onClick={() => void send()}
            disabled={!text.trim()}
            aria-label={editing ? "Save" : "Send"}
            className={cx(
              "chat-accent-bg grid size-11 shrink-0 place-items-center rounded-full shadow-sm transition-transform active:scale-90 disabled:opacity-40",
              text.trim() && "anim-pop",
            )}
          >
            {editing ? <Check size={21} strokeWidth={2.6} /> : <SendHorizontal size={20} />}
          </button>
        </div>
      </footer>

      {/* The ⋮ menu: everything about this chat in one place. */}
      <Sheet open={menu} onClose={() => setMenu(false)} title={title}>
        <div className="overflow-hidden rounded-2xl bg-surface-2">
          <SheetRow icon={Palette} label="Chat theme & wallpaper" onClick={() => { setMenu(false); setLooking(true); }} />
          <SheetRow icon={Star} label={`Starred messages${starred?.length ? ` (${starred.length})` : ""}`} onClick={() => { setMenu(false); setStarredOpen(true); }} />
          <SheetRow icon={Search} label="Search" onClick={() => { setMenu(false); setFinding(true); }} />
          <SheetRow icon={Files} label="Files" onClick={() => { setMenu(false); setView("files"); }} />
          <SheetRow
            icon={pref?.muted ? Bell : BellOff}
            label={pref?.muted ? "Unmute" : "Mute notifications"}
            onClick={() => { setMenu(false); void setThreadPref(thread, { muted: !pref?.muted }); }}
          />
          <SheetRow icon={Info} label={isGroup ? "Group info" : "Contact info"} onClick={() => { setMenu(false); setInfo(true); }} />
        </div>
      </Sheet>

      {looking && <ChatLookSheet open onClose={() => setLooking(false)} appDark={appDark} thread={thread} />}

      <Sheet open={starredOpen} onClose={() => setStarredOpen(false)} title="Starred messages">
        {(starred ?? []).length === 0 ? (
          <p className="py-6 text-center text-[14px] text-muted">Hold a message and tap Star to keep it here.</p>
        ) : (
          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto pb-2">
            {[...(starred ?? [])]
              .sort((a, b) => b.at - a.at)
              .map((x) => {
                const m = byId.get(x.id);
                if (!m) return null;
                return (
                  <li key={x.id}>
                    <button
                      onClick={() => {
                        setStarredOpen(false);
                        jumpTo(x.id);
                      }}
                      className="flex w-full items-start gap-3 rounded-2xl bg-surface-2 px-3 py-2.5 text-left active:scale-[0.99]"
                    >
                      <Star size={16} className="mt-0.5 shrink-0 fill-current text-[#e0a21b]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-bold text-muted">
                          {m.author === me ? "You" : (people.get(m.author)?.name ?? "Someone")} · {dayLabel(m.createdAt)}
                        </span>
                        <span className="line-clamp-2 block text-[14.5px]">{gist(m)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </Sheet>

      {/* Hold a message: react, reply, copy, forward, star, edit, delete. */}
      <Sheet open={!!holding} onClose={() => setHolding(null)} title="Message">
        {holding && isGroup && holding.author === me && !holding.deleted && (
          <div className="mb-3 rounded-2xl bg-surface-2 px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">
              <Eye size={14} /> Seen by
            </p>
            <p className="mt-1 text-[14px]">
              {(() => {
                const who = [...seenBy].filter(([, at]) => at >= holding.createdAt).map(([id]) => people.get(id)?.name?.split(" ")[0] ?? "Someone");
                return who.length ? who.join(", ") : "Nobody yet";
              })()}
            </p>
          </div>
        )}
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
          {holding && !holding.deleted && (
            <SheetRow
              icon={Star}
              label={starSet.has(holding.id) ? "Unstar" : "Star"}
              onClick={() => {
                const id = holding.id;
                setHolding(null);
                if (starSet.has(id)) void db.starred.delete(id);
                else void db.starred.put({ id, thread, at: Date.now() });
                toast.show(starSet.has(id) ? "Removed from Starred" : "Starred");
              }}
            />
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

      {docAsk && <SendDocSheet key={docAsk.name + docAsk.size + docAsk.lastModified} file={docAsk} thread={thread} onClose={() => setDocAsk(null)} />}
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
  ]
    .filter((x) => x.thread)
    // The chat you are in comes first, so re-sharing here is one tap.
    .sort((a, b) => Number(b.thread === current) - Number(a.thread === current));
  if (!items.length) return <p className="py-6 text-center text-[14px] text-muted">No chats yet.</p>;
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
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
              {x.name}
              {x.thread === current && <span className="ml-1.5 text-[12px] font-semibold text-muted">· this chat</span>}
            </span>
            <Forward size={17} className="text-mess" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Each person in a group gets their own name colour, like WhatsApp. */
const NAME_COLORS = ["#c2561c", "#2b8a7e", "#c03d5a", "#3d6fb0", "#8a6d12", "#5f8a2b", "#b0462f", "#1f7a9a"];
function nameColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return NAME_COLORS[Math.abs(h) % NAME_COLORS.length];
}

function Bubble({
  m,
  quoted,
  quotedName,
  mine,
  showName,
  showAvatar,
  avatarSpace,
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
  fresh,
  starred,
  flash,
  myName,
  onJump,
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
  avatarSpace: boolean;
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
  /** Arrived (or was sent) while the chat is open: it pops in. */
  fresh: boolean;
  starred: boolean;
  flash: boolean;
  myName: string;
  onJump: (id: string) => void;
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
  const jumbo = !m.deleted && m.kind === "text" && !quoted && isJumbo(m.body);
  const [more, setMore] = useState(false);
  const long = m.kind === "text" && m.body.length > 700;
  const mentionsMe = !mine && !!myName && new RegExp(`@${escapeRe(myName.split(" ")[0])}\\b`, "i").test(m.body);
  const counts = new Map<string, number>();
  for (const r of reacts) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  const mineReact = reacts.find((r) => r.userId === me)?.emoji;

  return (
    <div id={`msg-${m.id}`} className={cx("relative flex items-end gap-2", mine ? "justify-end" : "justify-start", first ? "mt-[var(--gap-first)]" : "mt-[var(--gap)]")}>
      {dx > 10 && (
        <span className="absolute top-1/2 left-1 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-orange/15 text-mess" style={{ opacity: Math.min(1, dx / 56) }}>
          <CornerUpLeft size={16} />
        </span>
      )}
      {group && avatarSpace && !mine && <span className="w-8 shrink-0">{showAvatar && <Avatar name={name} avatar={avatar} size={32} />}</span>}
      <div
        className={cx("min-w-0 touch-pan-y", card ? "w-[84%]" : "max-w-[80%]", mine && "flex flex-col items-end")}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform 180ms ease-out" }}
      >
        <div
          {...handlers}
          className={cx(
            "px-3 py-1.5 leading-snug [overflow-wrap:anywhere] select-none",
            mine
              ? cx("bubble-out", "rounded-[var(--r)]", !first && "rounded-tr-[6px]", !last && "rounded-br-[6px]")
              : cx("bubble-in", "rounded-[var(--r)]", !first && "rounded-tl-[6px]", !last && "rounded-bl-[6px]"),
            jumbo && "!bg-transparent !shadow-none !px-1",
            mentionsMe && "ring-2 ring-[var(--chat-accent)]/60",
            fresh && "anim-bubble",
            flash && "flash-hit",
            card && "w-full",
            m.deleted && "italic opacity-70",
          )}
        >
          {showName && (
            <p className="mb-0.5 text-[12.5px] font-extrabold" style={{ color: nameColor(m.author) }}>
              {name}
            </p>
          )}
          {quoted && !m.deleted && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onJump(quoted.id);
              }}
              className="mb-1 flex w-full gap-2 overflow-hidden rounded-lg bg-black/[0.05] py-1 pr-2.5 text-left"
            >
              <span className="w-[3px] shrink-0 rounded-full" style={{ background: nameColor(quoted.author) }} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-extrabold" style={{ color: nameColor(quoted.author) }}>
                  {quotedName(quoted.author)}
                </span>
                <span className="block truncate text-[13px] text-muted">{gist(quoted)}</span>
              </span>
            </button>
          )}
          {m.deleted ? (
            <span className="flex items-center gap-1.5 text-muted">
              <Trash2 size={13} /> This message was deleted
            </span>
          ) : m.kind === "poll" && m.data?.options ? (
            <PollCard m={m} people={people} />
          ) : m.kind === "file" && m.data?.path && (m.data as ChatFile).solution?.title ? (
            <SolutionCard f={m.data as ChatFile} mine={mine} from={name} sentAt={m.createdAt} />
          ) : m.kind === "file" && m.data?.path ? (
            <FileCard f={m.data as ChatFile} />
          ) : m.kind === "task" && m.data ? (
            <TaskCard t={m.data} mine={mine} />
          ) : jumbo ? (
            <span className="block text-[44px] leading-tight">{m.body.trim()}</span>
          ) : (
            <span className="whitespace-pre-wrap">
              <RichText text={long && !more ? `${m.body.slice(0, 600).trimEnd()}…` : m.body} />
              {long && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMore((v) => !v);
                  }}
                  className="chat-accent ml-1 font-bold"
                >
                  {more ? "Show less" : "Read more"}
                </button>
              )}
            </span>
          )}
          {(last || m.pending || m.failed || m.editedAt) && (
            <span className={cx("-mb-0.5 mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted", jumbo && "chat-chip rounded-full px-2 py-0.5")}>
              {starred && <Star size={11} className="fill-current" aria-label="Starred" />}
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

function TaskCard({ t, mine }: { t: NonNullable<ChatMessage["data"]>; mine: boolean }) {
  const toast = useToast();
  // Already in my Tasks (same title and due day), whether I sent it or added it before.
  const have = useLiveQuery(
    () => db.tasks.filter((x) => !x.deletedAt && x.title.trim() === (t.title ?? "").trim() && (x.dueDate ?? null) === (t.dueDate ?? null)).count(),
    [t.title, t.dueDate],
  );
  const added = (have ?? 0) > 0;
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
            toast.show("Added to your Tasks");
          }}
          className={cx(
            "mt-2 flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold",
            added ? "border-safe text-safe" : "border-orange/50 text-mess",
          )}
        >
          {added ? <Check size={13} /> : <Plus size={13} />} {added ? "In your Tasks" : mine ? "Add to my Tasks" : "Add this to your Tasks?"}
        </button>
      </div>
    </div>
  );
}

function TaskPicker({ onPick }: { onPick: (t: Task) => void }) {
  const [making, setMaking] = useState(false);
  const subjects = useLiveQuery(() => db.subjects.filter((x) => !x.deletedAt).toArray(), []);
  const tasks = useLiveQuery(
    () => db.tasks.filter((t) => !t.deletedAt && !t.done).toArray(),
    [],
  );
  const list = (tasks ?? []).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return (
    <div className="max-h-[66vh] space-y-3 overflow-y-auto pb-2">
      {making ? (
        <TaskForm subjects={subjects ?? []} onDone={() => {}} onCreated={onPick} submitLabel="Add to my Tasks & send" />
      ) : (
        <button
          onClick={() => setMaking(true)}
          className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-orange/60 px-3.5 py-3 text-left text-[15px] font-bold text-mess"
        >
          <Plus size={18} /> New task
        </button>
      )}
      {tasks && list.length === 0 && !making && <p className="py-3 text-center text-[13.5px] text-muted">No open tasks yet — make one above.</p>}
      {list.length > 0 && <p className="px-1 text-[12.5px] font-bold text-muted">Or share one you already have</p>}
    <ul className="space-y-2">
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
    </div>
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
  const saved = useFileCached(f.path);
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
          {saved && " · On phone"}
        </span>
      </span>
      {busy ? (
        <Clock size={19} className="shrink-0 animate-pulse text-muted" />
      ) : saved ? (
        <FileCheck size={19} className="shrink-0 text-safe" />
      ) : (
        <Download size={19} className="shrink-0 text-mess" />
      )}
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

/** 1–3 emoji and nothing else: shown big, without a bubble. */
function isJumbo(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 24) return false;
  if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(t)) return false;
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t.replace(/\s/g, ""))].length : t.length / 2;
  return seg >= 1 && seg <= 3 && /\p{Extended_Pictographic}/u.test(t);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Links you can tap and @mentions in colour; everything else as typed. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+|@[\p{L}]+)/u);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (/^(https?:\/\/|www\.)/.test(p)) {
          const url = p.startsWith("www.") ? `https://${p}` : p;
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="chat-accent break-all underline underline-offset-2"
            >
              {p}
            </a>
          );
        }
        if (p.startsWith("@")) return <b key={i} className="chat-accent font-bold">{p}</b>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
