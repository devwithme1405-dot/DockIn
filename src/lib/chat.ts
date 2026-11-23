"use client";

import type { ChatSolution } from "./solution";
import { useLiveQuery } from "dexie-react-hooks";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { db } from "./db";
import type { Task, TaskReminder } from "./types";
import { cleanReminders } from "./taskReminders";
import { getSupabase } from "./supabase";
import { notifyPush } from "./push";
import { mimeOf } from "./files";

/**
 * Chat: one-to-one with a friend, or a whole group.
 *
 * Messages live in Supabase (table `messages`, guarded by RLS) and are mirrored
 * into the phone's own database, so a chat opens instantly and reads offline.
 * While the app is open a realtime channel streams new ones in; on open and on
 * resume a pull catches up whatever arrived while it was closed.
 */

export type ThreadId = string;

export interface ChatMessage {
  id: string;
  thread: ThreadId;
  author: string;
  body: string;
  kind: "text" | "task" | "poll" | "file";
  /** A task card, a poll, or a document — by kind. */
  data?: ChatData | null;
  replyTo?: string | null;
  /** Epoch ms. */
  createdAt: number;
  deleted?: boolean;
  /** Epoch ms of the last edit. */
  editedAt?: number | null;
  /** Deleted for me only (this phone). */
  hidden?: boolean;
  /** Written here, not yet confirmed by the server (in the outbox: sent as soon as the line lets it). */
  pending?: boolean;
  /** The server refused it (not a network problem): shown with "tap to retry". */
  failed?: boolean;
}

export interface ChatTask {
  title: string;
  kind: string;
  dueDate: string | null;
  dueTime: string | null;
  subject?: string | null;
  shareId?: string | null;
  /** "<sender>:<their task id>" — the same task shared twice is the same origin. */
  origin?: string | null;
  notes?: string | null;
  priority?: string | null;
  /** The sender's reminders — everyone who gets the task gets them too (they can change their own). */
  reminders?: TaskReminder[] | null;
  /** 0 when first shared; each "send changes" counts up. A higher one updates the copy people already have. */
  rev?: number;
  /** This message carries changes to a task sent before (not a new task). */
  update?: boolean;
}

export interface ChatPoll {
  question: string;
  options: string[];
}

export interface ChatFile {
  name: string;
  size: number;
  type: string;
  path: string;
  /** Stored gzip-compressed (big files); unpacked on download. */
  gz?: boolean;
  /** Sent as the answer to an LMS assignment (see lib/solution.ts). */
  solution?: ChatSolution;
}

/** A text message that also carries a button: "compare" opens Compare's sharing switches. */
export type ChatInvite = { invite?: "compare" };
export type ChatData = ChatTask & Partial<ChatPoll> & Partial<ChatFile> & ChatInvite;

export interface PollVote {
  /** messageId:userId */
  id: string;
  messageId: string;
  userId: string;
  choice: number;
}

export interface ChatRead {
  thread: ThreadId;
  /** Epoch ms of the newest message you have seen. */
  readAt: number;
  muted?: boolean;
  pinned?: boolean;
}

export interface ChatPerson {
  id: string;
  name: string;
  avatar?: string;
}

export const groupThread = (groupId: string): ThreadId => `g:${groupId}`;
export function directThread(a: string, b: string): ThreadId {
  const [x, y] = [a, b].sort();
  return `d:${x}:${y}`;
}
/** The other person in a one-to-one thread. */
export function otherIn(thread: ThreadId, me: string): string | null {
  if (!thread.startsWith("d:")) return null;
  const [, a, b] = thread.split(":");
  return a === me ? b : a;
}

let myId: string | null = null;
export function chatMe(): string | null {
  return myId;
}

/**
 * Who is signed in, from the session saved on this phone — no network. Every
 * send path uses this, so a pull that failed on a weak signal can never leave
 * chat thinking nobody is signed in.
 */
async function ensureMe(): Promise<string | null> {
  if (myId) return myId;
  myId = await whoIsSignedIn();
  return myId;
}

/**
 * The signed-in user's id. Asking Supabase can need the network (an expired
 * token gets refreshed); on a dead line that fails — so fall back to the
 * session saved on this phone. A weak signal must never look like "signed out":
 * that is how a message used to vanish.
 */
async function whoIsSignedIn(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.user.id) return data.session.user.id;
  } catch {
    /* fall through to what is saved */
  }
  return savedUserId();
}

function savedUserId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
      const v = JSON.parse(localStorage.getItem(k) || "null") as { user?: { id?: string } } | null;
      if (v?.user?.id) return v.user.id;
    }
  } catch {
    /* nothing saved */
  }
  return null;
}

/** Hook: your user id, resolved from the saved session. */
export function useChatMe(): string | null {
  return useLiveQuery(async () => (await ensureMe()) ?? "", []) || null;
}

interface Row {
  id: string;
  thread: string;
  author: string;
  body: string;
  kind: ChatMessage["kind"];
  data: ChatData | null;
  reply_to: string | null;
  created_at: string;
  deleted_at: string | null;
  edited_at?: string | null;
}

const toMsg = (r: Row): ChatMessage => ({
  id: r.id,
  thread: r.thread,
  author: r.author,
  body: r.deleted_at ? "" : r.body,
  kind: r.kind,
  data: r.deleted_at ? null : r.data,
  replyTo: r.reply_to,
  createdAt: Date.parse(r.created_at),
  deleted: !!r.deleted_at,
  editedAt: r.edited_at ? Date.parse(r.edited_at) : null,
});

/** Keeps this phone's own flags (deleted for me) when a server copy arrives. */
async function putMsgs(list: ChatMessage[]): Promise<void> {
  const prev = await db.messages.bulkGet(list.map((m) => m.id));
  await db.messages.bulkPut(list.map((m, i) => (prev[i]?.hidden ? { ...m, hidden: true } : m)));
  const fresh = list.filter((m, i) => !prev[i]);
  noteDelivered(list);
  // One at a time: the live channel and a pull can deliver the same message
  // together, and the origin check must see the first one's result.
  absorbing = absorbing.then(() => absorbSharedTasks(fresh)).catch(() => {});
  await absorbing;
}
let absorbing: Promise<void> = Promise.resolve();

/** The key that makes one shared task land once, however many ways it arrives. */
export function taskOriginOf(author: string, d: Pick<ChatTask, "origin" | "title" | "dueDate">): string {
  return d.origin || `${author}:${(d.title ?? "").trim().toLowerCase()}:${d.dueDate ?? ""}`;
}

/**
 * A task a friend sends you (directly or in a group you are in) goes straight
 * into your Tasks — once. Sent twice, or to the group and to you as well, it is
 * still one task: the origin is remembered, and a task already in your list
 * with the same title and day counts as having it. Only recent messages are
 * taken in, so signing in on a new phone doesn't replay months of shares.
 */
async function absorbSharedTasks(fresh: ChatMessage[]): Promise<void> {
  const me = myId;
  if (!me) return;
  const recent = Date.now() - 7 * 86400_000;
  const incoming = fresh
    .filter((m) => m.kind === "task" && m.author !== me && !m.deleted && m.data?.title && m.createdAt > recent)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (!incoming.length) return;
  // Let this login's tasks arrive from the cloud first: a shared task deleted or
  // finished before a logout must not come back as a new one.
  const { afterFirstSync } = await import("./sync");
  await afterFirstSync();
  const { addTask, updateTask } = await import("./repo");
  const kinds = ["assignment", "exam", "project", "quiz", "personal"];
  for (const m of incoming) {
    const d = m.data as ChatTask;
    const key = taskOriginOf(m.author, d);
    const rev = Number.isFinite(Number(d.rev)) ? Math.max(0, Math.floor(Number(d.rev))) : 0;
    const fields = {
      title: d.title.trim().slice(0, 120),
      kind: (kinds.includes(d.kind) ? d.kind : "assignment") as Task["kind"],
      dueDate: d.dueDate ?? null,
      dueTime: d.dueTime ?? null,
      notes: [d.subject, d.notes].filter(Boolean).join(" · "),
      priority: (["low", "med", "high"].includes(d.priority ?? "") ? d.priority : "med") as Task["priority"],
    };

    // Already have it (by the link kept on this phone, or the one on the task itself)?
    const known = await db.taskOrigins.get(key);
    const mineId = known?.taskId ?? (await db.tasks.filter((t) => t.origin === key).first())?.id;
    if (mineId) {
      const mine = await db.tasks.get(mineId);
      // The sender changed it: change my copy in place — never a second task.
      // A copy I deleted stays deleted; ticked off stays ticked off.
      if (mine && !mine.deletedAt && rev > (mine.originRev ?? 0)) {
        await updateTask(mine.id, { ...fields, origin: key, originRev: rev });
      }
      if (!known) await db.taskOrigins.put({ key, taskId: mineId, at: Date.now() });
      continue;
    }
    // Deleted ones count too: deleting a shared task means "I don't want it".
    const same = await db.tasks
      .filter((t) => t.title.trim().toLowerCase() === d.title.trim().toLowerCase() && (t.dueDate ?? null) === (d.dueDate ?? null))
      .first();
    if (same) {
      await db.taskOrigins.put({ key, taskId: same.id, at: Date.now() });
      if (!same.origin) await updateTask(same.id, { origin: key, originRev: rev });
      continue;
    }
    const t = await addTask({
      ...fields,
      // Only what is well-formed survives (it came from someone else's phone).
      reminders: cleanReminders(d.reminders),
      origin: key,
      originRev: rev,
    });
    await db.taskOrigins.put({ key, taskId: t.id, at: Date.now() });
  }
}

/**
 * Sends one of my tasks to chats (friends and/or groups). Everyone there gets
 * it added to their Tasks once, however many of these chats they are in.
 *
 * `update`: the task was sent before and I changed it — the copies people
 * already have change in place (a new person in the list simply gets it).
 * The chats it went to are remembered on the task, for "send changes" later.
 */
export async function sendTaskTo(threads: ThreadId[], t: Task, subject?: string | null, update = false): Promise<void> {
  if (!(await ensureMe()) || !myId) throw new Error("Sign in to share.");
  const current = (await db.tasks.get(t.id)) ?? t;
  const origin = `${myId}:${current.id}`;
  await markTaskShared(origin, current.id);
  const rev = update ? (current.shareRev ?? 0) + 1 : (current.shareRev ?? 0);
  const task: ChatTask = {
    title: current.title,
    kind: current.kind,
    dueDate: current.dueDate,
    dueTime: current.dueTime,
    subject: subject ?? null,
    origin,
    notes: current.notes || null,
    priority: current.priority,
    reminders: current.reminders?.length ? current.reminders : null,
    rev,
  };
  const list = [...new Set(threads)];
  const before = new Set(current.sharedWith ?? []);
  // Chats that had it get "changes"; a chat new to it just gets the task.
  for (const th of list) await sendMessage(th, "", { task: update && before.has(th) ? { ...task, update: true } : task });
  const { updateTask } = await import("./repo");
  await updateTask(current.id, { sharedWith: [...new Set([...(current.sharedWith ?? []), ...list])], shareRev: rev });
}

/** Remember my own task as shared, so it never comes back to me as a copy. */
export async function markTaskShared(origin: string, taskId: string): Promise<void> {
  await db.taskOrigins.put({ key: origin, taskId, at: Date.now() });
}

const SINCE_KEY = "dockin-chat-since";

function since(): string {
  try {
    return localStorage.getItem(SINCE_KEY) || new Date(Date.now() - 30 * 86400_000).toISOString();
  } catch {
    return new Date(Date.now() - 30 * 86400_000).toISOString();
  }
}

/** A request that may hang on a dead line: give up after a while instead. */
function deadline(ms = 20_000): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/**
 * Pulls re-read a few minutes before the last one ended: a message the server
 * stamped a moment earlier but committed a moment later (busy server, weak
 * line) would otherwise fall between two pulls and never show up.
 */
const OVERLAP = 5 * 60_000;
/** Reactions, votes and names are re-read in full only this often. */
const FULL_EVERY = 5 * 60_000;
let lastFull = 0;
let pulling: Promise<void> | null = null;
let pullAgain = false;

/**
 * Catch up on everything since the last pull, plus read and delivered marks.
 * One at a time: calls made while one runs are folded into one more after it.
 */
export function pullChat(opts: { full?: boolean } = {}): Promise<void> {
  if (opts.full) lastFull = 0;
  if (pulling) {
    pullAgain = true;
    return pulling;
  }
  pulling = (async () => {
    try {
      do {
        pullAgain = false;
        await pullOnce();
      } while (pullAgain);
    } finally {
      pulling = null;
    }
  })();
  return pulling;
}

async function pullOnce(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  // Re-check who is signed in (another account may have signed in), without
  // ever forgetting them because the network is bad.
  const who = await whoIsSignedIn();
  if (!who) return;
  if (who !== myId) myId = who;
  void flushOutbox();

  const from = new Date(Math.max(0, Date.parse(since()) - OVERLAP)).toISOString();
  const [msgs, changed] = await Promise.all([
    sb.from("messages").select("*").gt("created_at", from).order("created_at", { ascending: true }).limit(1000).abortSignal(deadline()),
    // Edits and "delete for everyone" made while this phone wasn't listening.
    sb.from("messages").select("*").or(`edited_at.gt.${from},deleted_at.gt.${from}`).limit(500).abortSignal(deadline()),
  ]);
  if (msgs.error) return; // offline or timed out — the next pull catches up
  const rows = (msgs.data ?? []) as Row[];
  const extra = changed.error ? [] : ((changed.data ?? []) as Row[]);
  if (rows.length || extra.length) {
    await putMsgs([...rows, ...extra.filter((r) => !rows.some((x) => x.id === r.id))].map(toMsg));
    if (rows.length)
      try {
        localStorage.setItem(SINCE_KEY, rows[rows.length - 1].created_at);
      } catch {
        /* a full re-pull next time is fine */
      }
  }
  await pullMarks(sb);

  if (Date.now() - lastFull < FULL_EVERY) return;
  lastFull = Date.now();
  const [reacts, votes, people] = await Promise.all([
    sb.from("message_reactions").select("message_id,user_id,emoji").abortSignal(deadline()),
    sb.from("poll_votes").select("message_id,user_id,choice").abortSignal(deadline()),
    sb.from("profiles").select("user_id,name,avatar").abortSignal(deadline()),
  ]);
  if (!reacts.error) {
    const list = (reacts.data ?? []) as { message_id: string; user_id: string; emoji: string }[];
    await db.transaction("rw", db.msgReactions, async () => {
      await db.msgReactions.clear();
      await db.msgReactions.bulkPut(
        list.map((r) => ({ id: `${r.message_id}:${r.user_id}`, messageId: r.message_id, userId: r.user_id, emoji: r.emoji })),
      );
    });
  }
  if (!votes.error) {
    const list = (votes.data ?? []) as { message_id: string; user_id: string; choice: number }[];
    await db.transaction("rw", db.pollVotes, async () => {
      await db.pollVotes.clear();
      await db.pollVotes.bulkPut(
        list.map((v) => ({ id: `${v.message_id}:${v.user_id}`, messageId: v.message_id, userId: v.user_id, choice: v.choice })),
      );
    });
  }
  if (!people.error) {
    const list = (people.data ?? []) as { user_id: string; name: string | null; avatar: string | null }[];
    await db.chatPeople.bulkPut(
      list.map((p) => ({ id: p.user_id, name: p.name?.trim() || "Someone", avatar: p.avatar ?? undefined })),
    );
  }
}

type MarkRow = { user_id: string; thread: string; read_at: string; delivered_at?: string | null; muted?: boolean; pinned?: boolean };

/** Read marks (mine: unread counts; theirs: blue ticks) and delivered marks (grey double ticks). */
async function pullMarks(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<void> {
  let marks: { data: unknown[] | null; error: { message: string } | null } = await sb
    .from("thread_reads")
    .select("user_id,thread,read_at,delivered_at,muted,pinned")
    .abortSignal(deadline());
  // Server not updated yet (no delivered_at column): read marks still work.
  if (marks.error && /delivered_at/.test(marks.error.message)) marks = await sb.from("thread_reads").select("user_id,thread,read_at,muted,pinned").abortSignal(deadline());
  if (marks.error) return;
  const list = (marks.data ?? []) as MarkRow[];
  await db.seenBy.bulkPut(list.filter((r) => r.user_id !== myId).map(markOf));
  const mine = list.filter((r) => r.user_id === myId);
  if (!mine.length) return;
  const local = new Map((await db.chatReads.bulkGet(mine.map((m) => m.thread))).filter(Boolean).map((r) => [r!.thread, r!]));
  await db.chatReads.bulkPut(
    mine.map((m) => {
      const here = local.get(m.thread);
      // Never move a read mark back: this phone may have read further than the server knows yet.
      return { ...here, thread: m.thread, readAt: Math.max(Date.parse(m.read_at) || 0, here?.readAt ?? 0), muted: !!m.muted, pinned: !!m.pinned };
    }),
  );
}

const markOf = (r: Pick<MarkRow, "user_id" | "thread" | "read_at" | "delivered_at">) => {
  const readAt = Date.parse(r.read_at) || 0;
  return {
    id: `${r.thread}:${r.user_id}`,
    thread: r.thread,
    userId: r.user_id,
    readAt,
    // Read means delivered too.
    deliveredAt: Math.max(readAt, r.delivered_at ? Date.parse(r.delivered_at) || 0 : 0),
  };
};

// ---------------------------------------------------------------------------
// Delivered (✓✓): this phone tells the sender their messages reached it.

const deliveredSent = new Map<ThreadId, number>();
let deliverTimer: ReturnType<typeof setTimeout> | undefined;
const deliverQueue = new Map<ThreadId, number>();

/** Messages from others reached this phone: say so, a few at a time. */
function noteDelivered(list: ChatMessage[]): void {
  for (const m of list) {
    if (m.author === myId || m.deleted) continue;
    if ((deliveredSent.get(m.thread) ?? 0) >= m.createdAt) continue;
    deliverQueue.set(m.thread, Math.max(deliverQueue.get(m.thread) ?? 0, m.createdAt));
  }
  if (!deliverQueue.size) return;
  clearTimeout(deliverTimer);
  deliverTimer = setTimeout(() => void sendDelivered(), 1200);
}

async function sendDelivered(): Promise<void> {
  const sb = getSupabase();
  if (!sb || !myId) return;
  const batch = [...deliverQueue];
  deliverQueue.clear();
  for (const [thread, at] of batch) {
    const { error } = await sb.rpc("mark_delivered", { p_thread: thread, p_at: new Date(at).toISOString() }).abortSignal(deadline(15_000));
    if (!error) deliveredSent.set(thread, Math.max(deliveredSent.get(thread) ?? 0, at));
    // Not set up on the server yet: nothing to retry.
    else if (!/mark_delivered|function/i.test(error.message)) deliverQueue.set(thread, Math.max(deliverQueue.get(thread) ?? 0, at));
  }
  if (deliverQueue.size) deliverTimer = setTimeout(() => void sendDelivered(), 15_000);
}

let channel: RealtimeChannel | null = null;

/** Live updates while the app is open. Safe to call repeatedly. */
export function listenChat(): () => Promise<unknown> | void {
  const sb = getSupabase();
  if (!sb || channel) return () => {};
  channel = sb
    .channel("dockin-chat")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
      const row = payload.new as Row | undefined;
      if (row?.id) void putMsgs([toMsg(row)]);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "thread_reads" }, (payload) => {
      const r = payload.new as Partial<MarkRow> | undefined;
      if (!r?.user_id || !r.thread || r.user_id === myId) return;
      void db.seenBy.put(markOf({ user_id: r.user_id, thread: r.thread, read_at: r.read_at ?? "", delivered_at: r.delivered_at }));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (payload) => {
      const r = (payload.new ?? payload.old) as { message_id?: string; user_id?: string; emoji?: string } | undefined;
      if (!r?.message_id || !r.user_id) return;
      const id = `${r.message_id}:${r.user_id}`;
      if (payload.eventType === "DELETE") void db.msgReactions.delete(id);
      else void db.msgReactions.put({ id, messageId: r.message_id, userId: r.user_id, emoji: r.emoji ?? "👍" });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, (payload) => {
      const v = (payload.new ?? payload.old) as { message_id?: string; user_id?: string; choice?: number } | undefined;
      if (!v?.message_id || !v.user_id) return;
      const id = `${v.message_id}:${v.user_id}`;
      if (payload.eventType === "DELETE") void db.pollVotes.delete(id);
      else void db.pollVotes.put({ id, messageId: v.message_id, userId: v.user_id, choice: v.choice ?? 0 });
    })
    // Every (re)connect: catch up on whatever came while the line was down —
    // the live stream alone misses those.
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void pullChat();
    });
  return () => {
    const ch = channel;
    channel = null;
    return ch ? sb.removeChannel(ch) : undefined;
  };
}

export async function sendMessage(
  thread: ThreadId,
  body: string,
  opts: { task?: ChatTask; poll?: ChatPoll; file?: ChatFile; invite?: "compare"; replyTo?: string | null; silent?: boolean } = {},
): Promise<void> {
  const { task, poll, file, invite, replyTo, silent } = opts;
  if (!getSupabase() || !(await ensureMe()) || !myId) throw new Error("Sign in to chat.");
  const text = body.trim();
  if (!text && !task && !poll && !file) return;
  // Saved on this phone first, then sent from the outbox — however bad the line,
  // it is never lost: it waits (🕓) and goes as soon as the network lets it.
  await db.messages.put({
    id: crypto.randomUUID(),
    thread,
    author: myId,
    body: text.slice(0, 4000),
    kind: task ? "task" : poll ? "poll" : file ? "file" : "text",
    // An invite is still a text message (older apps just show the words).
    data: (task ?? poll ?? file ?? (invite ? { invite } : null)) as ChatData | null,
    replyTo: replyTo ?? null,
    createdAt: Date.now(),
    pending: true,
    ...(silent ? { silent: true } : {}),
  } as ChatMessage);
  void flushOutbox();
}

// ---------------------------------------------------------------------------
// Outbox: messages written on this phone that the server hasn't confirmed yet.

let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let backoff = 0;
const BACKOFF = [2_000, 4_000, 8_000, 15_000, 30_000];

const networkish = (msg: string) => /fetch|network|abort|timeout|timed out|load failed|offline|503|502|504|gateway|ECONN|socket/i.test(msg);

/**
 * Sends every waiting message, oldest first. The same id every try, and a
 * duplicate is ignored by the server — so a send whose answer got lost on the
 * way back can be tried again without ever making a second copy.
 */
export function flushOutbox(): Promise<void> {
  // One pass at a time; a call during a pass asks for one more after it.
  if (flushRun) {
    flushAgain = true;
    return flushRun;
  }
  flushRun = (async () => {
    try {
      do {
        flushAgain = false;
        await flushOnce();
      } while (flushAgain);
    } finally {
      flushRun = null;
    }
  })();
  return flushRun;
}
let flushRun: Promise<void> | null = null;
let flushAgain = false;

async function flushOnce(): Promise<void> {
  if (flushing) return;
  const sb = getSupabase();
  if (!sb || !(await ensureMe()) || !myId) return;
  flushing = true;
  clearTimeout(flushTimer);
  try {
    const me = myId;
    const waiting = await db.messages.filter((m) => !!m.pending && !m.failed && m.author === me).sortBy("createdAt");
    for (const m of waiting) {
      const { error } = await sb
        .from("messages")
        .upsert({ id: m.id, thread: m.thread, body: m.body, kind: m.kind, data: m.data ?? null, reply_to: m.replyTo ?? null }, { onConflict: "id", ignoreDuplicates: true })
        .abortSignal(deadline(25_000));
      if (error) {
        if (networkish(error.message) || !error.code) {
          // The line: keep it waiting, try again soon (and the moment the network is back).
          flushAgain = false;
          flushTimer = setTimeout(() => void flushOutbox(), BACKOFF[Math.min(backoff++, BACKOFF.length - 1)]);
          return;
        }
        // The server said no (not the network): show "tap to retry" on it.
        await db.messages.update(m.id, { pending: false, failed: true });
        continue;
      }
      backoff = 0;
      // The server's own copy (its timestamp) replaces the one written here.
      const { data } = await sb.from("messages").select("*").eq("id", m.id).abortSignal(deadline(15_000)).maybeSingle();
      if (data) await putMsgs([toMsg(data as Row)]);
      else await db.messages.update(m.id, { pending: false });
      void markRead(m.thread).catch(() => {});
      if (!(m as ChatMessage & { silent?: boolean }).silent) notifyPush({ type: "message", id: m.id });
    }
  } catch {
    flushTimer = setTimeout(() => void flushOutbox(), BACKOFF[Math.min(backoff++, BACKOFF.length - 1)]);
  } finally {
    flushing = false;
  }
}

/** Kick the outbox whenever the network might be back. */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    backoff = 0;
    void flushOutbox();
  });
  window.addEventListener("dockin:back-online", () => {
    backoff = 0;
    void flushOutbox();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushOutbox();
  });
}

/** "Not sent — tap to retry": the same message (same id) goes back in the outbox. */
export async function retryMessage(m: ChatMessage): Promise<void> {
  await db.messages.update(m.id, { failed: false, pending: true });
  backoff = 0;
  await flushOutbox();
}

/** Edit your own text message (WhatsApp allows it for a while; so do we). */
export async function editMessage(id: string, body: string): Promise<void> {
  const text = body.trim().slice(0, 4000);
  if (!text) return;
  const sb = getSupabase();
  const at = new Date().toISOString();
  await db.messages.update(id, { body: text, editedAt: Date.parse(at) });
  if (sb) await sb.from("messages").update({ body: text, edited_at: at }).eq("id", id);
}

/** Delete for me: gone from this phone only. */
export async function hideMessage(id: string): Promise<void> {
  await db.messages.update(id, { hidden: true });
}

/** Clear a whole chat from this phone (others keep it). */
export async function clearThreadForMe(thread: ThreadId): Promise<void> {
  const ids = (await db.messages.where("thread").equals(thread).primaryKeys()) as string[];
  await db.messages.bulkUpdate(ids.map((key) => ({ key, changes: { hidden: true } })));
}

/** Forward: the same text, task, poll or document into another chat. */
export async function forwardMessage(m: ChatMessage, to: ThreadId): Promise<void> {
  const d = m.data ?? undefined;
  await sendMessage(to, m.body, {
    task: m.kind === "task" ? d : undefined,
    poll: m.kind === "poll" ? (d as ChatPoll) : undefined,
    file: m.kind === "file" && d ? await fileFor(to, d as ChatFile) : undefined,
  });
}

/** The storage folder of a chat: "g:…" → "g_…". Only its members can open what is in it. */
export const threadFolder = (thread: ThreadId) => thread.replace(/:/g, "_");

/**
 * A document only opens for the members of the chat whose folder it is in. So
 * forwarding one puts a copy in the other chat's folder — otherwise the people
 * there get a card they can never open ("That file is no longer there").
 */
export async function fileFor(to: ThreadId, f: ChatFile): Promise<ChatFile> {
  const folder = threadFolder(to);
  if (f.path.startsWith(`${folder}/`)) return f;
  const sb = getSupabase();
  if (!sb || !(await ensureMe()) || !myId) throw new Error("Sign in to forward files.");
  const path = `${folder}/${crypto.randomUUID()}/${f.path.split("/").pop() || f.name}`;
  // A copy on the server: nothing passes through the phone.
  let copied = false;
  for (let attempt = 0; attempt < 3 && !copied; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1200 * attempt));
    const { error } = await sb.storage.from("chat-files").copy(f.path, path);
    copied = !error;
    if (error && !networkish(error.message)) break;
  }
  if (copied) {
    const hit = await db.fileCache.get(f.path).catch(() => undefined);
    if (hit) void db.fileCache.put({ path, blob: hit.blob, at: Date.now() }).catch(() => {});
    return { ...f, path };
  }
  // No server copy (older server rules): send the file again from this phone.
  const blob = await downloadChatFile(f);
  const sent = await uploadChatFile(to, new File([blob], f.name, { type: f.type }));
  const out: ChatFile = { ...f, ...sent, name: f.name };
  if (!sent.gz) delete out.gz;
  return out;
}

/** When each other person last read this chat — for the blue ✓✓. */
export function useSeenBy(thread: ThreadId): Map<string, number> {
  const list = useLiveQuery(() => db.seenBy.where("thread").equals(thread).toArray(), [thread]);
  return new Map((list ?? []).map((r) => [r.userId, r.readAt]));
}

/** Up to when each other person's phone has received this chat — for the grey ✓✓. */
export function useDeliveredTo(thread: ThreadId): Map<string, number> {
  const list = useLiveQuery(() => db.seenBy.where("thread").equals(thread).toArray(), [thread]);
  return new Map((list ?? []).map((r) => [r.userId, Math.max(r.readAt, r.deliveredAt ?? 0)]));
}

/** "Delete for everyone": your own message only. */
export async function unsendMessage(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await db.messages.update(id, { deleted: true, body: "", data: null });
  await sb.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", id);
}

export async function markRead(thread: ThreadId): Promise<void> {
  const last = await db.messages.where("thread").equals(thread).last();
  const readAt = Math.max(Date.now(), last?.createdAt ?? 0);
  const prev = await db.chatReads.get(thread);
  await db.chatReads.put({ ...prev, thread, readAt });
  const sb = getSupabase();
  if (!sb || !(await ensureMe()) || !myId) return;
  await sb.from("thread_reads").upsert({ user_id: myId, thread, read_at: new Date(readAt).toISOString() });
}

/** Puts the unread dot back on a chat (this phone only; others still see it as read). */
export async function markUnread(thread: ThreadId): Promise<void> {
  const mine = myId;
  const theirs = await db.messages.where("thread").equals(thread).filter((m) => m.author !== mine && !m.hidden).sortBy("createdAt");
  const last = theirs[theirs.length - 1];
  if (!last) return;
  const prev = await db.chatReads.get(thread);
  await db.chatReads.put({ ...prev, thread, readAt: last.createdAt - 1 });
}

/** Mute (no notifications) or pin (top of the list) a chat — yours only. */
export async function setThreadPref(thread: ThreadId, pref: { muted?: boolean; pinned?: boolean }): Promise<void> {
  const prev = await db.chatReads.get(thread);
  await db.chatReads.put({ thread, readAt: prev?.readAt ?? 0, muted: prev?.muted, pinned: prev?.pinned, ...pref });
  const sb = getSupabase();
  if (!sb || !(await ensureMe()) || !myId) return;
  await sb.from("thread_reads").upsert({ user_id: myId, thread, read_at: new Date(prev?.readAt || Date.now()).toISOString(), ...pref });
}

/** Your vote on a poll; tapping your current choice again takes the vote back. */
export async function votePoll(messageId: string, choice: number): Promise<void> {
  const sb = getSupabase();
  if (!sb || !(await ensureMe()) || !myId) return;
  const id = `${messageId}:${myId}`;
  const prev = await db.pollVotes.get(id);
  if (prev?.choice === choice) {
    await db.pollVotes.delete(id);
    await sb.from("poll_votes").delete().eq("message_id", messageId).eq("user_id", myId);
    return;
  }
  await db.pollVotes.put({ id, messageId, userId: myId, choice });
  await sb.from("poll_votes").upsert({ message_id: messageId, user_id: myId, choice, updated_at: new Date().toISOString() });
}

/** React to a message; the same emoji again takes it back. */
export async function reactMessage(messageId: string, emoji: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || !(await ensureMe()) || !myId) return;
  const id = `${messageId}:${myId}`;
  const prev = await db.msgReactions.get(id);
  if (prev?.emoji === emoji) {
    await db.msgReactions.delete(id);
    await sb.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", myId);
    return;
  }
  await db.msgReactions.put({ id, messageId, userId: myId, emoji });
  await sb.from("message_reactions").upsert({ message_id: messageId, user_id: myId, emoji, updated_at: new Date().toISOString() });
}

export function useReactionsFor(thread: ThreadId): Map<string, { emoji: string; userId: string }[]> {
  const list = useLiveQuery(async () => {
    const ids = (await db.messages.where("thread").equals(thread).primaryKeys()) as string[];
    return db.msgReactions.where("messageId").anyOf(ids).toArray();
  }, [thread]);
  const map = new Map<string, { emoji: string; userId: string }[]>();
  for (const r of list ?? []) {
    const arr = map.get(r.messageId) ?? [];
    arr.push({ emoji: r.emoji, userId: r.userId });
    map.set(r.messageId, arr);
  }
  return map;
}

export function usePollVotes(messageId: string): PollVote[] {
  return useLiveQuery(() => db.pollVotes.where("messageId").equals(messageId).toArray(), [messageId]) ?? [];
}

export const CHAT_FILE_TYPES =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,application/pdf,text/plain";
const CHAT_MAX = 50 * 1024 * 1024;
/** Above this, files are gzipped before upload (the server takes up to 50 MB). */
const SQUEEZE_AT = 8 * 1024 * 1024;

async function squeeze(file: Blob): Promise<Blob | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const out = await new Response(file.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    // Already-compressed files (most PDFs, .docx/.pptx) barely shrink: not worth it.
    return out.size < file.size * 0.95 ? out : null;
  } catch {
    return null;
  }
}

async function unsqueeze(data: Blob, type: string): Promise<Blob> {
  const raw = await new Response(data.stream().pipeThrough(new DecompressionStream("gzip"))).blob();
  return new Blob([raw], { type });
}

/** Uploads a document for a chat (PDF/Word/PowerPoint/Excel/text). Big ones are compressed first. */
export async function uploadChatFile(thread: ThreadId, file: File): Promise<ChatFile> {
  const sb = getSupabase();
  if (!sb || !(await ensureMe()) || !myId) throw new Error("Sign in to send files.");
  if (!/\.(pdf|docx?|pptx?|xlsx?|txt)$/i.test(file.name)) throw new Error("Only documents: PDF, Word, PowerPoint, Excel or text.");
  const small = file.size > SQUEEZE_AT ? await squeeze(file) : null;
  const body: Blob = small ?? file;
  if (body.size > CHAT_MAX) throw new Error("That file is over 50 MB, even compressed.");
  const clean = file.name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, " ").trim().slice(-80) || "document";
  const path = `${threadFolder(thread)}/${crypto.randomUUID()}/${clean}`;
  const contentType = mimeOf(file.name, file.type);
  // A weak line drops uploads: try again a few times before giving up.
  let error: { message: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    ({ error } = await sb.storage.from("chat-files").upload(path, body, { contentType, upsert: false }));
    // An earlier try did get through (only its answer was lost): that's a success.
    if (error && attempt && /exists|duplicate/i.test(error.message)) error = null;
    if (!error || !networkish(error.message)) break;
  }
  if (error) {
    if (networkish(error.message)) throw new Error("The network is too weak to send this file right now — try again in a bit.");
    if (/Bucket not found/i.test(error.message)) throw new Error("Documents are not set up on the server yet.");
    if (/mime type/i.test(error.message)) throw new Error("Only documents: PDF, Word, PowerPoint, Excel or text.");
    if (/maximum allowed size|too large|413/i.test(error.message)) throw new Error("That file is too big for the server right now (limit 10 MB until the update is applied).");
    throw new Error(error.message);
  }
  void db.fileCache.put({ path, blob: file, at: Date.now() }).catch(() => {});
  return { name: clean, size: file.size, type: contentType, path, ...(small ? { gz: true } : {}) };
}

/** Keeps the newest ~120 MB of documents on the phone. */
async function trimFileCache() {
  const all = await db.fileCache.orderBy("at").reverse().toArray();
  let used = 0;
  const drop: string[] = [];
  for (const f of all) {
    used += f.blob.size;
    if (used > 120 * 1024 * 1024) drop.push(f.path);
  }
  if (drop.length) await db.fileCache.bulkDelete(drop);
}

/** True when this document is already on the phone. */
export function useFileCached(path: string | undefined): boolean {
  return useLiveQuery(async () => (path ? (await db.fileCache.where("path").equals(path).count()) > 0 : false), [path]) ?? false;
}

/** Downloads a chat document once; after that it opens from the phone, even offline. */
export async function downloadChatFile(f: ChatFile): Promise<Blob> {
  const hit = await db.fileCache.get(f.path).catch(() => undefined);
  if (hit) {
    void db.fileCache.update(f.path, { at: Date.now() }).catch(() => {});
    return hit.blob;
  }
  const sb = getSupabase();
  if (!sb) throw new Error("Offline.");
  const { data, error } = await sb.storage.from("chat-files").download(f.path);
  if (error || !data) {
    if (error && networkish(error.message)) throw new Error("The network is too weak to open this file right now — try again in a bit.");
    throw new Error("This file can't be opened here — it may have been deleted. Ask them to send it again.");
  }
  const blob = f.gz ? await unsqueeze(data, f.type) : data;
  await db.fileCache.put({ path: f.path, blob, at: Date.now() }).catch(() => {});
  void trimFileCache().catch(() => {});
  return blob;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useThread(thread: ThreadId | null): ChatMessage[] | undefined {
  return useLiveQuery(
    (): Promise<ChatMessage[]> =>
      thread
        ? db.messages
            .where("thread")
            .equals(thread)
            .filter((m) => !m.hidden)
            .sortBy("createdAt")
        : Promise.resolve([]),
    [thread],
  );
}

export interface ThreadSummary {
  thread: ThreadId;
  last: ChatMessage;
  unread: number;
  muted: boolean;
  pinned: boolean;
}

/** Every thread you have messages in, newest first, with unread counts. */
export function useThreads(): ThreadSummary[] | undefined {
  return useLiveQuery(async () => {
    const [allRaw, reads] = await Promise.all([db.messages.toArray(), db.chatReads.toArray()]);
    const all = allRaw.filter((m) => !m.hidden);
    const readAt = new Map(reads.map((r) => [r.thread, r.readAt]));
    const pref = new Map(reads.map((r) => [r.thread, r]));
    const by = new Map<ThreadId, ThreadSummary>();
    // Replying counts as having read everything before it.
    const myLast = new Map<ThreadId, number>();
    for (const m of all) if (m.author === myId) myLast.set(m.thread, Math.max(myLast.get(m.thread) ?? 0, m.createdAt));
    for (const m of all) {
      const t = by.get(m.thread) ?? {
        thread: m.thread,
        last: m,
        unread: 0,
        muted: !!pref.get(m.thread)?.muted,
        pinned: !!pref.get(m.thread)?.pinned,
      };
      if (m.createdAt >= t.last.createdAt) t.last = m;
      const seen = Math.max(readAt.get(m.thread) ?? 0, myLast.get(m.thread) ?? 0);
      if (m.author !== myId && !m.deleted && m.createdAt > seen) t.unread += 1;
      by.set(m.thread, t);
    }
    // Pinned first; also list pinned/muted chats that have no messages yet.
    for (const r of reads)
      if ((r.pinned || r.muted) && !by.has(r.thread))
        by.set(r.thread, {
          thread: r.thread,
          last: { id: "", thread: r.thread, author: "", body: "", kind: "text", createdAt: 0 },
          unread: 0,
          muted: !!r.muted,
          pinned: !!r.pinned,
        });
    return [...by.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.last.createdAt - a.last.createdAt);
  }, []);
}

/** Total unread messages, for the Friends tab badge. */
export function useUnreadChats(): number {
  const threads = useThreads();
  return (threads ?? []).reduce((n, t) => n + (t.muted ? 0 : t.unread), 0);
}

export function usePeople(): Map<string, ChatPerson> {
  const list = useLiveQuery(() => db.chatPeople.toArray(), []);
  const friends = useLiveQuery(() => db.friends.toArray(), []);
  const map = new Map<string, ChatPerson>();
  for (const p of list ?? []) map.set(p.id, p);
  for (const f of friends ?? []) map.set(f.id, { id: f.id, name: f.name, avatar: f.avatar });
  return map;
}

export async function clearChat(): Promise<void> {
  await Promise.all([db.messages.clear(), db.chatReads.clear(), db.chatPeople.clear(), db.pollVotes.clear(), db.msgReactions.clear(), db.seenBy.clear()]);
  try {
    localStorage.removeItem(SINCE_KEY);
  } catch {
    /* nothing to clear */
  }
  myId = null;
}
