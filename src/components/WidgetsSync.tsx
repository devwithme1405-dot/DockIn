"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { appliesOn, getProfile } from "@/lib/repo";
import { projectedClassesOn, useAttendanceData, useCollege } from "@/lib/college";
import { LAST_TEACHING_DAY } from "@/lib/academic";
import { describe } from "@/lib/attendance";
import { addDays, toDateStr, weekdayOf } from "@/lib/dates";
import { MEALS, menuForDay } from "@/lib/mess";
import { setWidgets } from "@/lib/native";

/** "Breakfast 07:30 AM - 09:30 AM" → ["07:30", "09:30"]. */
function timesIn(label: string): [string, string] | null {
  const m = [...label.matchAll(/(\d{1,2}):(\d{2})\s*([AP]M)?/gi)].map((x) => {
    let h = Number(x[1]);
    const pm = /pm/i.test(x[3] ?? "");
    if (pm && h < 12) h += 12;
    if (!pm && /am/i.test(x[3] ?? "") && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${x[2]}`;
  });
  return m.length >= 2 ? [m[0], m[1]] : null;
}

const ENDS: Record<string, string> = { breakfast: "10:30", lunch: "15:00", snacks: "18:30", dinner: "22:00" };

/**
 * Feeds the home-screen widgets: attendance, the coming classes, tasks, the
 * mess menu and the mess pass. Sends a fresh summary whenever any of it
 * changes; the phone works out "next class" and "serving now" by the clock.
 */
export function WidgetsSync() {
  const profile = useLiveQuery(() => getProfile(), []);
  const target = profile?.target ?? 75;
  const { data } = useAttendanceData(target);
  const { state } = useCollege();
  const camu = state.camu?.connected ? state.camu : undefined;
  const slots = useLiveQuery(() => db.slots.filter((s) => !s.deletedAt).toArray(), []);
  const subjects = useLiveQuery(() => db.subjects.filter((s) => !s.deletedAt).toArray(), []);
  const tasks = useLiveQuery(() => db.tasks.filter((t) => !t.deletedAt && !t.done).toArray(), []);
  const today = toDateStr();
  const [pass, setPass] = useState<{ value: string; png: string } | null>(null);
  const qrValue = (camu?.cafeteria?.qr || profile?.messQr || "").trim();

  useEffect(() => {
    if (!qrValue || pass?.value === qrValue) return;
    let alive = true;
    QRCode.toDataURL(qrValue, { width: 360, margin: 1, errorCorrectionLevel: "M" })
      .then((png) => alive && setPass({ value: qrValue, png }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [qrValue, pass?.value]);

  const summary = useMemo(() => {
    if (profile === undefined || !tasks) return null;
    const o = data?.overall;
    const att = o && o.pct !== null ? { pct: o.pct, tone: o.state, line: describe(o), present: o.attended, total: o.total, target } : null;

    // Today and the next week's classes, with times (the widget picks "next").
    const names = new Map((subjects ?? []).map((s) => [s.id, s.name]));
    const classes: { date: string; from: string; to: string; name: string; room: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      const list = camu
        ? projectedClassesOn(camu, d, LAST_TEACHING_DAY).map((p) => ({ date: d, from: p.from, to: p.to, name: p.name, room: p.room ?? "" }))
        : (slots ?? [])
            .filter((s) => s.weekday === weekdayOf(d) && appliesOn(s, d))
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((s) => ({ date: d, from: s.start, to: s.end, name: names.get(s.subjectId) ?? "Class", room: s.room ?? "" }));
      classes.push(...list);
      if (classes.length > 40) break;
    }

    // Overdue first, then soonest; undated last.
    const order = (t: { dueDate: string | null; dueTime: string | null }) => `${t.dueDate ?? "9999-99-99"} ${t.dueTime ?? "99:99"}`;
    const list = [...tasks].sort((a, b) => order(a).localeCompare(order(b))).slice(0, 5);

    // The mess: Camu's menu for today, else the weekly one typed in.
    const meals: { meal: string; from: string; to: string; items: string }[] = [];
    const caf = camu?.cafeteria?.meals ?? [];
    if (caf.length) {
      for (const m of caf) {
        const t = timesIn(m.label);
        meals.push({ meal: m.meal, from: t?.[0] ?? "", to: t?.[1] ?? "23:59", items: m.items.trim() });
      }
    } else {
      const day = menuForDay(profile?.messMenu, new Date().getDay());
      for (const m of MEALS) {
        const items = day[m.key];
        if (items) meals.push({ meal: m.label, from: m.from, to: ENDS[m.key], items });
      }
    }

    return {
      v: 1,
      att,
      classes,
      tasks: { pending: tasks.length, list: list.map((t) => ({ title: t.title, date: t.dueDate, time: t.dueTime })) },
      mess: { date: today, meals },
      pass: pass && pass.value === qrValue ? pass.png : null,
    };
  }, [profile, tasks, data, target, subjects, slots, camu, today, pass, qrValue]);

  useEffect(() => {
    if (!summary) return;
    const t = window.setTimeout(() => setWidgets(summary), 1500);
    return () => window.clearTimeout(t);
  }, [summary]);

  return null;
}
