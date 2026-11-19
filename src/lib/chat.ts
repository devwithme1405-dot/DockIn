"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { db } from "./db";
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
  /** Written here, not yet confirmed by the server. */
  pending?: boolean;
  failed?: boolean;
}

export interface ChatTask {
  title: string;
  kind: string;
  dueDate: string | null;
  dueTime: string | null;
  subject?: string | null;
  shareId?: string | null;
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
}

export type ChatData = ChatTask & Partial<ChatPoll> & Partial<ChatFile>;

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
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  myId = data.session?.user.id ?? null;
  return myId;
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
}

const SINCE_KEY = "dockin-chat-since";

function since(): string {
  try {
    return localStorage.getItem(SINCE_KEY) || new Date(Date.now() - 30 * 86400_000).toISOString();
  } catch {
    return new Date(Date.now() - 30 * 86400_000).toISOString();
  }
}

/** Catch up on everything since the last pull, plus read marks and names. */
export async function pullChat(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  myId = null;
  if (!(await ensureMe())) return;

  const from = since();
  const [msgs, reads, people] = await Promise.all([
    sb
      .from("messages")
      .select("*")
      .gt("created_at", from)
      .order("created_at", { ascending: true })
      .limit(1000),
    sb.from("thread_reads").select("*").eq("user_id", myId),
    sb.from("profiles").select("user_id,name,avatar"),
  ]);
  if (msgs.error) return; // tables not set up yet, or offline — try again later
  const rows = (msgs.data ?? []) as Row[];
  if (rows.length) {
    await putMsgs(rows.map(toMsg));
    try {
      localStorage.setItem(SINCE_KEY, rows[rows.length - 1].created_at);
    } catch {
      /* a full re-pull next time is fine */
    }
  }
  const others = await sb.from("thread_reads").select("user_id,thread,read_at").neq("user_id", myId);
  if (!others.error) {
    const list = (others.data ?? []) as { user_id: string; thread: string; read_at: string }[];
    await db.seenBy.bulkPut(list.map((r) => ({ id: `${r.thread}:${r.user_id}`, thread: r.thread, userId: r.user_id, readAt: Date.parse(r.read_at) })));
  }
  if (!reads.error) {
    const marks = (reads.data ?? []) as { thread: string; read_at: string; muted?: boolean; pinned?: boolean }[];
    await db.chatReads.bulkPut(
      marks.map((m) => ({ thread: m.thread, readAt: Date.parse(m.read_at), muted: !!m.muted, pinned: !!m.pinned })),
    );
  }
  const reacts = await sb.from("message_reactions").select("message_id,user_id,emoji");
  if (!reacts.error) {
    const list = (reacts.data ?? []) as { message_id: string; user_id: string; emoji: string }[];
    await db.msgReactions.clear();
    await db.msgReactions.bulkPut(
      list.map((r) => ({ id: `${r.message_id}:${r.user_id}`, messageId: r.message_id, userId: r.user_id, emoji: r.emoji })),
    );
  }
  const votes = await sb.from("poll_votes").select("message_id,user_id,choice");
  if (!votes.error) {
    const list = (votes.data ?? []) as { message_id: string; user_id: string; choice: number }[];
    await db.pollVotes.clear();
    await db.pollVotes.bulkPut(
      list.map((v) => ({ id: `${v.message_id}:${v.user_id}`, messageId: v.message_id, userId: v.user_id, choice: v.choice })),
    );
  }
  if (!people.error) {
    const list = (people.data ?? []) as { user_id: string; name: string | null; avatar: string | null }[];
    await db.chatPeople.bulkPut(
      list.map((p) => ({ id: p.user_id, name: p.name?.trim() || "Someone", avatar: p.avatar ?? undefined })),
    );
  }
}

let channel: RealtimeChannel | null = null;

/** Live updates while the app is open. Safe to call repeatedly. */
export function listenChat(): () => void {
  const sb = getSupabase();
  if (!sb || channel) return () => {};
  channel = sb
    .channel("dockin-chat")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
      const row = payload.new as Row | undefined;
      if (row?.id) void putMsgs([toMsg(row)]);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "thread_reads" }, (payload) => {
      const r = payload.new as { user_id?: string; thread?: string; read_at?: string } | undefined;
      if (!r?.user_id || !r.thread || r.user_id === myId) return;
      void db.seenBy.put({ id: `${r.thread}:${r.user_id}`, thread: r.thread, userId: r.user_id, readAt: Date.parse(r.read_at ?? "") || 0 });
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
    .subscribe();
  return () => {
    if (channel) void sb.removeChannel(channel);
    channel = null;
  };
}

export async function sendMessage(
  thread: ThreadId,
  body: string,
  opts: { task?: ChatTask; poll?: ChatPoll; file?: ChatFile; replyTo?: string | null; silent?: boolean } = {},
): Promise<void> {
  const { task, poll, file, replyTo, silent } = opts;
  const sb = getSupabase();
  if (!sb || !(await ensureMe()) || !myId) throw new Error("Sign in to chat.");
  const text = body.trim();
  if (!text && !task && !poll && !file) return;
  const id = crypto.randomUUID();
  const local: ChatMessage = {
    id,
    thread,
    author: myId,
    body: text.slice(0, 4000),
    kind: task ? "task" : poll ? "poll" : file ? "file" : "text",
    data: (task ?? poll ?? file ?? null) as ChatData | null,
    replyTo: replyTo ?? null,
    createdAt: Date.now(),
    pending: true,
  };
  await db.messages.put(local);
  const { data, error } = await sb
    .from("messages")
    .insert({ id, thread, body: local.body, kind: local.kind, data: local.data, reply_to: local.replyTo })
    .select("*")
    .single();
  if (error || !data) {
    await db.messages.update(id, { pending: false, failed: true });
    throw new Error(/Failed to fetch|NetworkError/i.test(error?.message ?? "") ? "No internet — tap to retry." : "Could not send.");
  }
  await db.messages.put(toMsg(data as Row));
  await markRead(thread);
  if (!silent) notifyPush({ type: "message", id });
}

export async function retryMessage(m: ChatMessage): Promise<void> {
  await db.messages.delete(m.id);
  const d = m.data ?? undefined;
  await sendMessage(m.thread, m.body, {
    task: m.kind === "task" ? d : undefined,
    poll: m.kind === "poll" ? (d as ChatPoll) : undefined,
    file: m.kind === "file" ? (d as ChatFile) : undefined,
    replyTo: m.replyTo,
  });
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
    file: m.kind === "file" ? (d as ChatFile) : undefined,
  });
}

/** When each other person last read this chat — for ✓✓ Seen. */
export function useSeenBy(thread: ThreadId): Map<string, number> {
  const list = useLiveQuery(() => db.seenBy.where("thread").equals(thread).toArray(), [thread]);
  return new Map((list ?? []).map((r) => [r.userId, r.readAt]));
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
  const path = `${thread.replace(/:/g, "_")}/${crypto.randomUUID()}/${clean}`;
  const contentType = mimeOf(file.name, file.type);
  const { error } = await sb.storage.from("chat-files").upload(path, body, { contentType, upsert: false });
  if (error) {
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
  if (error || !data) throw new Error("That file is no longer there.");
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
