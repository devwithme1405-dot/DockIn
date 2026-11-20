"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { getSupabase } from "./supabase";

/**
 * What one person shares for the Compare screen. Small on purpose (a few KB):
 * it is published at most once a minute and only when it changed.
 */
export interface StatsSubject {
  /** Stable key on the owner's phone ("camu:12" or a subject id) — used for the trip days. */
  key: string;
  name: string;
  code: string;
  present: number;
  total: number;
}

export interface StatsTask {
  /** Shared tasks carry the same origin on every phone, so they can be lined up. */
  origin: string;
  title: string;
  due: string | null;
  done: boolean;
}

export interface FriendStatsData {
  v: 1;
  at: number;
  target: number;
  attendance?: { present: number; total: number; subjects: StatsSubject[] };
  tasks?: {
    pending: number;
    overdue: number;
    dueThisWeek: number;
    doneThisWeek: number;
    lmsPending: number;
    next: { title: string; due: string } | null;
    shared: StatsTask[];
  };
  /** For the trip planner: which subjects meet on each coming day (indexes into attendance.subjects). */
  days?: Record<string, number[]>;
  /** Today's classes with times, for "who's free now". */
  today?: { date: string; classes: { from: string; to: string; name: string }[] };
}

export const pct = (present: number, total: number) => (total > 0 ? (present / total) * 100 : null);

const KEY = "dockin-stats-published";

/** Publishes (or, with null, withdraws) my snapshot. Skips when nothing changed. */
export async function publishStats(data: FriendStatsData | null): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data: auth } = await sb.auth.getUser();
  const me = auth.user?.id;
  if (!me) return;
  const body = data ? JSON.stringify({ ...data, at: 0 }) : "off";
  let last: string | null = null;
  try {
    last = localStorage.getItem(KEY);
  } catch {
    /* fine */
  }
  if (last === `${me}:${body}`) return;
  if (!data) {
    const { error } = await sb.from("friend_stats").delete().eq("user_id", me);
    if (error) return;
  } else {
    const { error } = await sb
      .from("friend_stats")
      .upsert({ user_id: me, data: { ...data, at: Date.now() }, updated_at: new Date().toISOString() });
    if (error) return;
  }
  try {
    localStorage.setItem(KEY, `${me}:${body}`);
  } catch {
    /* fine */
  }
}

/** Everyone's shared snapshots I may see (RLS: me and my friends). */
export async function pullFriendStats(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb.from("friend_stats").select("user_id,data,updated_at");
  if (error) return;
  const rows = (data ?? []) as { user_id: string; data: FriendStatsData; updated_at: string }[];
  await db.transaction("rw", db.friendStats, async () => {
    await db.friendStats.clear();
    await db.friendStats.bulkPut(rows.map((r) => ({ userId: r.user_id, data: r.data, at: Date.parse(r.updated_at) || 0 })));
  });
}

export function useFriendStats(): Map<string, FriendStatsData> | undefined {
  const rows = useLiveQuery(() => db.friendStats.toArray(), []);
  if (!rows) return undefined;
  return new Map(rows.map((r) => [r.userId, r.data as FriendStatsData]));
}

/** "09:30", "9:30 AM", "14:05" → minutes since midnight. */
export function toMinutes(t: string): number | null {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(t ?? "");
  if (!m) return null;
  let h = Number(m[1]) % 24;
  const ap = (m[3] ?? "").toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

/** Normalised subject name, so "DBMS Lab" and "dbms  lab" line up across friends. */
export function subjectKey(s: Pick<StatsSubject, "code" | "name">): string {
  return (s.code || s.name).toLowerCase().replace(/[^a-z0-9]/g, "");
}
