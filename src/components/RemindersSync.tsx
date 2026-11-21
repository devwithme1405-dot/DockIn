"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getProfile } from "@/lib/repo";
import { useTasks } from "@/lib/hooks";
import { db } from "@/lib/db";
import { useAttendanceData } from "@/lib/college";
import { onPhone, scheduleReminders } from "@/lib/native";
import { buildReminders } from "@/lib/reminders";
import { toDateStr } from "@/lib/dates";
import { getSupabase } from "@/lib/supabase";
import type { ChatFile } from "@/lib/chat";
import { findMyAssignment } from "@/lib/solution";
import { retirePractice } from "@/lib/practiceLms";

/**
 * Keeps the phone's reminders in step with the data: whenever the timetable,
 * the tasks or attendance change — and whenever the app is reopened — it hands
 * the phone a fresh list of what to notify over the next day or so. Renders
 * nothing. Mounted only inside the app; off the phone it is a no-op.
 */
export function RemindersSync() {
  const profile = useLiveQuery(() => getProfile(), []);
  const target = profile?.target ?? 75;
  const { data } = useAttendanceData(target);
  const tasks = useTasks();
  // Shared tasks still open for you (not done, not hidden), for the 24 h / 30 min nudges.
  const shared = useLiveQuery(async () => {
    const states = new Map((await db.shareState.toArray()).map((x) => [x.id, x]));
    return (await db.shares.toArray())
      .filter((sh) => {
        const st = states.get(sh.id);
        return !st?.done && !st?.submitted && !st?.hidden;
      })
      .map((sh) => ({
        id: sh.id,
        title: sh.title,
        dueDate: sh.dueDate,
        dueTime: sh.dueTime,
        from: sh.groupName ? `${sh.authorName} in ${sh.groupName}` : sh.authorName,
      }));
  }, []);

  // The Practice LMS was removed: clear its pretend assignments from Tasks, once.
  useEffect(() => {
    void retirePractice().catch(() => {});
  }, []);

  // Solutions friends sent for assignments still open on my LMS.
  const solutions = useLiveQuery(async () => {
    const me = (await getSupabase()?.auth.getSession())?.data.session?.user.id ?? null;
    const since = Date.now() - 21 * 86_400_000;
    const rows = await db.messages
      .filter((m) => m.kind === "file" && !m.deleted && m.author !== me && m.createdAt > since && !!(m.data as ChatFile | null)?.solution?.title)
      .toArray();
    const friends = new Map((await db.friends.toArray()).map((x) => [x.id, x.name]));
    return rows.map((m) => ({ m, sol: (m.data as ChatFile).solution!, from: friends.get(m.author) ?? "A friend" }));
  }, []);

  useEffect(() => {
    if (!data || !tasks || !shared || !solutions) return;
    const open = solutions
      .map(({ m, sol, from }) => ({ m, sol, from, task: findMyAssignment(sol, tasks) }))
      .filter((x) => x.task && !x.task.done)
      .sort((a, b) => b.m.createdAt - a.m.createdAt)
      .map(({ m, sol, from, task }) => ({
        id: m.id,
        title: task!.title,
        from: from === "A friend" ? sol.authorName.split(" ")[0] || from : from.split(" ")[0],
        sentAt: m.createdAt,
        dueDate: task!.dueDate,
        dueTime: task!.dueTime,
        thread: m.thread,
      }));
    const run = () =>
      void scheduleReminders(
        buildReminders({
          sessions: data.sessions,
          subjects: data.subjects,
          tasks,
          overall: data.overall,
          stats: data.stats,
          target,
          today: toDateStr(),
          now: Date.now(),
          shared,
          solutions: open,
        }),
      );
    run();
    return onPhone("resume", run);
  }, [data, tasks, target, shared, solutions]);

  return null;
}
