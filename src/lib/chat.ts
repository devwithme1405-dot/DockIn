"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { db } from "./db";
import { getSupabase } from "./supabase";
import { notifyPush } from "./push";

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
  kind: "text" | "task";
  /** For a task card: what the task is. */
  data?: ChatTask | null;
  replyTo?: string | null;
  /** Epoch ms. */
  createdAt: number;
  deleted?: boolean;
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

export interface ChatRead {
  thread: ThreadId;
  /** Epoch ms of the newest message you have seen. */
  readAt: number;
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

interface Row {
  id: string;
  thread: string;
  author: string;
  body: string;
  kind: "text" | "task";
  data: ChatTask | null;
  reply_to: string | null;
  created_at: string;
  deleted_at: string | null;
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
});

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
  const { data: auth } = await sb.auth.getUser();
  myId = auth.user?.id ?? null;
  if (!myId) return;

  const from = since();
  const [msgs, reads, people] = await Promise.all([
    sb
      .from("messages")
      .select("id,thread,author,body,kind,data,reply_to,created_at,deleted_at")
      .gt("created_at", from)
      .order("created_at", { ascending: true })
      .limit(1000),
    sb.from("thread_reads").select("thread,read_at").eq("user_id", myId),
    sb.from("profiles").select("user_id,name,avatar"),
  ]);
  if (msgs.error) return; // tables not set up yet, or offline — try again later
  const rows = (msgs.data ?? []) as Row[];
  if (rows.length) {
    await db.messages.bulkPut(rows.map(toMsg));
    try {
      localStorage.setItem(SINCE_KEY, rows[rows.length - 1].created_at);
    } catch {
      /* a full re-pull next time is fine */
    }
  }
  if (!reads.error) {
    const marks = (reads.data ?? []) as { thread: string; read_at: string }[];
    await db.chatReads.bulkPut(marks.map((m) => ({ thread: m.thread, readAt: Date.parse(m.read_at) })));
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
      if (row?.id) void db.messages.put(toMsg(row));
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
  opts: { task?: ChatTask; replyTo?: string | null; silent?: boolean } = {},
): Promise<void> {
  const { task, replyTo, silent } = opts;
  const sb = getSupabase();
  if (!sb || !myId) throw new Error("Sign in to chat.");
  const text = body.trim();
  if (!text && !task) return;
  const id = crypto.randomUUID();
  const local: ChatMessage = {
    id,
    thread,
    author: myId,
    body: text.slice(0, 4000),
    kind: task ? "task" : "text",
    data: task ?? null,
    replyTo: replyTo ?? null,
    createdAt: Date.now(),
    pending: true,
  };
  await db.messages.put(local);
  const { data, error } = await sb
    .from("messages")
    .insert({ id, thread, body: local.body, kind: local.kind, data: local.data, reply_to: local.replyTo })
    .select("id,thread,author,body,kind,data,reply_to,created_at,deleted_at")
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
  await sendMessage(m.thread, m.body, { task: m.data ?? undefined, replyTo: m.replyTo });
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
  await db.chatReads.put({ thread, readAt });
  const sb = getSupabase();
  if (!sb || !myId) return;
  await sb.from("thread_reads").upsert({ user_id: myId, thread, read_at: new Date(readAt).toISOString() });
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useThread(thread: ThreadId | null): ChatMessage[] | undefined {
  return useLiveQuery(
    (): Promise<ChatMessage[]> =>
      thread ? db.messages.where("thread").equals(thread).sortBy("createdAt") : Promise.resolve([]),
    [thread],
  );
}

export interface ThreadSummary {
  thread: ThreadId;
  last: ChatMessage;
  unread: number;
}

/** Every thread you have messages in, newest first, with unread counts. */
export function useThreads(): ThreadSummary[] | undefined {
  return useLiveQuery(async () => {
    const [all, reads] = await Promise.all([db.messages.toArray(), db.chatReads.toArray()]);
    const readAt = new Map(reads.map((r) => [r.thread, r.readAt]));
    const by = new Map<ThreadId, ThreadSummary>();
    // Replying counts as having read everything before it.
    const myLast = new Map<ThreadId, number>();
    for (const m of all) if (m.author === myId) myLast.set(m.thread, Math.max(myLast.get(m.thread) ?? 0, m.createdAt));
    for (const m of all) {
      const t = by.get(m.thread) ?? { thread: m.thread, last: m, unread: 0 };
      if (m.createdAt >= t.last.createdAt) t.last = m;
      const seen = Math.max(readAt.get(m.thread) ?? 0, myLast.get(m.thread) ?? 0);
      if (m.author !== myId && !m.deleted && m.createdAt > seen) t.unread += 1;
      by.set(m.thread, t);
    }
    return [...by.values()].sort((a, b) => b.last.createdAt - a.last.createdAt);
  }, []);
}

/** Total unread messages, for the Friends tab badge. */
export function useUnreadChats(): number {
  const threads = useThreads();
  return (threads ?? []).reduce((n, t) => n + t.unread, 0);
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
  await Promise.all([db.messages.clear(), db.chatReads.clear(), db.chatPeople.clear()]);
  try {
    localStorage.removeItem(SINCE_KEY);
  } catch {
    /* nothing to clear */
  }
  myId = null;
}
