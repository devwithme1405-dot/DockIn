"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { countCancelled, summarize, withBase } from "./attendance";
import type {
  AttendanceSummary,
  CalEvent,
  Category,
  Expense,
  Friend,
  Group,
  Reaction,
  Session,
  Share,
  ShareState,
  Slot,
  Subject,
  Task,
} from "./types";

export function useSubjects(): Subject[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.subjects.filter((s) => !s.deletedAt).toArray()).sort(
        (a, b) => a.createdAt - b.createdAt,
      ),
    [],
  );
}

export function useSlots(): Slot[] | undefined {
  return useLiveQuery(
    () => db.slots.filter((s) => !s.deletedAt).toArray(),
    [],
  );
}

export function useSessionsOn(date: string): Session[] | undefined {
  return useLiveQuery(
    async () =>
      (
        await db.sessions
          .where("date")
          .equals(date)
          .filter((s) => !s.deletedAt)
          .toArray()
      ).sort((a, b) => a.start.localeCompare(b.start)),
    [date],
  );
}

export function useAllSessions(): Session[] | undefined {
  return useLiveQuery(
    () => db.sessions.filter((s) => !s.deletedAt).toArray(),
    [],
  );
}

export interface SubjectStat {
  subject: Subject;
  summary: AttendanceSummary;
  /** Whole-number counts shown on cards: present, absent (incl. earlier), cancelled. */
  counts: { present: number; absent: number; cancelled: number };
}

/** Per-subject and overall attendance, recomputed live as classes are marked. */
export function useAttendanceStats(target: number) {
  const subjects = useSubjects();
  const sessions = useAllSessions();

  return useMemo(() => {
    if (!subjects || !sessions) return undefined;
    const bySubject = new Map<string, Session[]>();
    for (const s of sessions) {
      const list = bySubject.get(s.subjectId);
      if (list) list.push(s);
      else bySubject.set(s.subjectId, [s]);
    }
    const stats: SubjectStat[] = subjects.map((subject) => {
      const own = bySubject.get(subject.id) ?? [];
      const summary = summarize(withBase(own, subject), target);
      return {
        subject,
        summary,
        counts: {
          present: summary.attended,
          absent: summary.total - summary.attended,
          cancelled: countCancelled(own),
        },
      };
    });
    const live = new Set(subjects.map((s) => s.id));
    let all: Pick<Session, "status" | "weight">[] = sessions.filter((s) =>
      live.has(s.subjectId),
    );
    for (const subject of subjects) all = withBase(all, subject);
    const overall = summarize(all, target);
    const overallCounts = {
      present: overall.attended,
      absent: overall.total - overall.attended,
      cancelled: stats.reduce((n, s) => n + s.counts.cancelled, 0),
    };
    return { stats, overall, overallCounts, subjects, sessions };
  }, [subjects, sessions, target]);
}

export function useExpenses(): Expense[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.expenses.filter((e) => !e.deletedAt).toArray()).sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
      ),
    [],
  );
}

export function useTasks(): Task[] | undefined {
  return useLiveQuery(
    () => db.tasks.filter((t) => !t.deletedAt).toArray(),
    [],
  );
}

export function useEvents(): CalEvent[] | undefined {
  return useLiveQuery(
    () => db.events.filter((e) => !e.deletedAt).toArray(),
    [],
  );
}

export function useFriends(): Friend[] | undefined {
  return useLiveQuery(
    async () => (await db.friends.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
}

export function useGroups(): Group[] | undefined {
  return useLiveQuery(
    async () => (await db.groups.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
}

export function useShares(): Share[] | undefined {
  return useLiveQuery(() => db.shares.toArray(), []);
}

export function useShareState(): Map<string, ShareState> | undefined {
  return useLiveQuery(
    async () => new Map((await db.shareState.toArray()).map((s) => [s.id, s])),
    [],
  );
}

/** Reactions on shared items, grouped by the item they belong to. */
export function useReactions(): Map<string, Reaction[]> | undefined {
  const rows = useLiveQuery(() => db.reactions.toArray(), []);
  return useMemo(() => {
    if (!rows) return undefined;
    const map = new Map<string, Reaction[]>();
    for (const r of rows) map.set(r.shareId, [...(map.get(r.shareId) ?? []), r]);
    return map;
  }, [rows]);
}

export function useCategories(): Category[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.categories.filter((c) => !c.deletedAt).toArray()).sort((a, b) => a.order - b.order),
    [],
  );
}
