"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getProfile } from "@/lib/repo";
import { useTasks } from "@/lib/hooks";
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

  useEffect(() => {
    if (!data || !tasks) return;
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
        }),
      );
    run();
    return onPhone("resume", run);
  }, [data, tasks, target]);

  return null;
}
