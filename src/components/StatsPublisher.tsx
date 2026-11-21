"use client";

import { useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getProfile, appliesOn } from "@/lib/repo";
import { classesOn, projectedClassesOn, subjectOf, useAttendanceData, useCollege } from "@/lib/college";
import { LAST_TEACHING_DAY } from "@/lib/academic";
import { addDays, toDateStr, weekdayOf } from "@/lib/dates";
import { publishStats, pullFriendStats, type FriendStatsData } from "@/lib/friendStats";
import { getSupabase } from "@/lib/supabase";
import { whileVisible } from "@/lib/visible";

/**
 * Keeps my Compare snapshot current — only the parts I chose to share, and
 * nothing at all until I switch sharing on. Also keeps friends' snapshots fresh.
 * Renders nothing.
 */
export function StatsPublisher() {
  const snapshot = useStatsSnapshot(false);

  // Publish a few seconds after things settle (ticking five tasks is one write).
  useEffect(() => {
    if (snapshot === undefined) return;
    const t = window.setTimeout(() => void publishStats(snapshot).catch(() => {}), 3000);
    return () => window.clearTimeout(t);
  }, [snapshot]);

  // Friends' numbers: on start, when the app comes back, and live.
  useEffect(() => {
    void pullFriendStats().catch(() => {});
    const sb = getSupabase();
    let timer = 0;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pullFriendStats().catch(() => {}), 800);
    };
    const live = whileVisible(() => {
      const ch = sb?.channel("dockin-friend-stats").on("postgres_changes", { event: "*", schema: "public", table: "friend_stats" }, soon).subscribe();
      return () => (ch && sb ? sb.removeChannel(ch) : undefined);
    });
    const onShow = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
      live();
    };
  }, []);

  return null;
}

const EVERYTHING = { attendance: true, tasks: true, schedule: true };

/**
 * My own snapshot. With `all`, every part regardless of what I share (for
 * showing myself on Compare); otherwise only what I chose to share, null when
 * nothing, undefined while loading.
 */
export function useStatsSnapshot(all: boolean): FriendStatsData | null | undefined {
  const profile = useLiveQuery(() => getProfile(), []);
  const share = all ? EVERYTHING : profile?.shareStats;
  const target = profile?.target ?? 75;
  const { data } = useAttendanceData(target);
  const { state } = useCollege();
  const camu = state.camu?.connected ? state.camu : undefined;
  const slots = useLiveQuery(() => db.slots.filter((s) => !s.deletedAt).toArray(), []);
  const subjects = useLiveQuery(() => db.subjects.filter((s) => !s.deletedAt).toArray(), []);
  const tasks = useLiveQuery(() => db.tasks.filter((t) => !t.deletedAt).toArray(), []);
  const origins = useLiveQuery(() => db.taskOrigins.toArray(), []);
  const today = toDateStr();

  const snapshot = useMemo((): FriendStatsData | null | undefined => {
    if (profile === undefined) return undefined;
    if (!share || (!share.attendance && !share.tasks && !share.schedule)) return null;
    if ((share.attendance || share.schedule) && !data) return undefined;
    const out: FriendStatsData = { v: 1, at: 0, target };

    const list = (data?.stats ?? []).map((s) => ({
      key: s.subject.id,
      name: s.subject.name,
      code: s.subject.code ?? "",
      present: s.summary.attended,
      total: s.summary.total,
    }));
    if (share.attendance && data) {
      out.attendance = { present: data.overall.attended, total: data.overall.total, subjects: list };
    }

    if (share.schedule) {
      // The coming days' classes, so friends can plan a trip with my numbers too.
      const index = new Map(list.map((s, i) => [s.key, i]));
      if (!out.attendance) out.attendance = { present: data?.overall.attended ?? 0, total: data?.overall.total ?? 0, subjects: list };
      const days: Record<string, number[]> = {};
      const last = LAST_TEACHING_DAY < addDays(today, 75) ? LAST_TEACHING_DAY : addDays(today, 75);
      for (let d = today; d <= last; d = addDays(d, 1)) {
        const keys = camu
          ? projectedClassesOn(camu, d, LAST_TEACHING_DAY).map((p) => {
              const sub = subjectOf(p, camu.subjects ?? []);
              return sub ? `camu:${sub.id}` : null;
            })
          : (slots ?? []).filter((s) => s.weekday === weekdayOf(d) && appliesOn(s, d)).map((s) => s.subjectId);
        const ix = keys.map((k) => (k ? index.get(k) : undefined)).filter((x): x is number => x !== undefined);
        if (ix.length) days[d] = ix;
      }
      out.days = days;
      const names = new Map((subjects ?? []).map((s) => [s.id, s.name]));
      out.today = {
        date: today,
        classes: camu
          ? classesOn(camu, today).map((p) => ({ from: p.from, to: p.to, name: p.name }))
          : (slots ?? [])
              .filter((s) => s.weekday === weekdayOf(today) && appliesOn(s, today))
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((s) => ({ from: s.start, to: s.end, name: names.get(s.subjectId) ?? "Class" })),
      };
    }

    if (share.tasks && tasks) {
      const week = addDays(today, 7);
      const weekAgo = Date.now() - 7 * 86400_000;
      const pending = tasks.filter((t) => !t.done);
      const next = pending.filter((t) => t.dueDate && t.dueDate >= today).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0];
      const byId = new Map(tasks.map((t) => [t.id, t]));
      const shared = (origins ?? [])
        .map((o) => ({ o, t: byId.get(o.taskId) }))
        .filter((x) => x.t && (!x.t.dueDate || x.t.dueDate >= addDays(today, -14)))
        .sort((a, b) => b.o.at - a.o.at)
        .slice(0, 30)
        .map(({ o, t }) => ({ origin: o.key, title: t!.title, due: t!.dueDate, done: t!.done }));
      out.tasks = {
        pending: pending.length,
        overdue: pending.filter((t) => t.dueDate && t.dueDate < today).length,
        dueThisWeek: pending.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= week).length,
        doneThisWeek: tasks.filter((t) => t.done && (t.doneAt ?? 0) > weekAgo).length,
        lmsPending: pending.filter((t) => t.source === "lms" && t.kind === "assignment").length,
        next: next ? { title: next.title, due: next.dueDate! } : null,
        shared,
      };
    }
    return out;
  }, [profile, share, target, data, camu, slots, subjects, tasks, origins, today]);

  return snapshot;
}
