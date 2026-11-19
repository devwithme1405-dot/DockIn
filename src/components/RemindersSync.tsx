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

  useEffect(() => {
    if (!data || !tasks || !shared) return;
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
        }),
      );
    run();
    return onPhone("resume", run);
  }, [data, tasks, target, shared]);

  return null;
}
