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
import { chatMe, otherIn, usePeople, useThreads, type ChatMessage } from "@/lib/chat";
import { toMinutes, useFriendStats } from "@/lib/friendStats";

/** A photo for the widget: small (the phone has little room for widget pictures). */
const small = new Map<string, string>();
function useSmallPhotos(photos: string[]): [Map<string, string>, number] {
  const [version, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    for (const src of photos) {
      if (small.has(src) || !src.startsWith("data:")) continue;
      small.set(src, "");
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = c.height = 96;
          const k = c.getContext("2d")!;
          const s = Math.max(96 / img.width, 96 / img.height);
          k.drawImage(img, (96 - img.width * s) / 2, (96 - img.height * s) / 2, img.width * s, img.height * s);
          small.set(src, c.toDataURL("image/jpeg", 0.8));
          if (alive) bump((n) => n + 1);
        } catch {
          /* initials then */
        }
      };
      img.src = src;
    }
    return () => {
      alive = false;
    };
  }, [photos]);
  return [small, version];
}

function gist(m: ChatMessage, me: string | null, name: (id: string) => string, group: boolean): string {
  const who = m.author === me ? "You: " : group ? `${name(m.author).split(" ")[0]}: ` : "";
  if (m.deleted) return "Message deleted";
  if (m.kind === "task") return `${who}📌 ${m.data?.title ?? "Task"}`;
  if (m.kind === "poll") return `${who}📊 ${m.data?.question ?? "Poll"}`;
  if (m.kind === "file") return `${who}📄 ${m.data?.name ?? "Document"}`;
  return who + m.body.replace(/\s+/g, " ");
}

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
  const threads = useThreads();
  const people = usePeople();
  const groups = useLiveQuery(() => db.groups.toArray(), []);
  const friendRows = useLiveQuery(() => db.friends.filter((f) => f.status === "accepted").toArray(), []);
  const stats = useFriendStats();
  const recent = useMemo(() => (threads ?? []).filter((t) => t.last.id).slice(0, 3), [threads]);
  const photos = useMemo(
    () => recent.map((t) => (t.thread.startsWith("g:") ? (groups ?? []).find((g) => `g:${g.id}` === t.thread)?.photo : people.get(otherIn(t.thread, chatMe() ?? "") ?? "")?.avatar) ?? "").filter(Boolean) as string[],
    [recent, groups, people],
  );
  const [smallPhotos, photoVersion] = useSmallPhotos(photos);
  // Whether "free now" changes as the clock moves: recheck every few minutes.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 5 * 60_000);
    return () => window.clearInterval(id);
  }, []);
  const today = toDateStr();
  const [pass, setPass] = useState<{ value: string; png: string } | null>(null);
  const qrValue = (camu?.cafeteria?.qr || profile?.messQr || "").trim();

  useEffect(() => {
    if (!qrValue || pass?.value === qrValue) return;
    let alive = true;
    QRCode.toDataURL(qrValue, { width: 720, margin: 2, errorCorrectionLevel: "M" })
      .then((png) => alive && setPass({ value: qrValue, png }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [qrValue, pass?.value]);

  const summary = useMemo(() => {
    if (profile === undefined || !tasks) return null;
    const o = data?.overall;
    // The subjects closest to (or under) the line come first.
    const subjectsAt = (data?.stats ?? [])
      .filter((s) => s.summary.pct !== null)
      .map((s) => ({ name: s.subject.code || s.subject.name, pct: s.summary.pct as number, tone: s.summary.state }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);
    const att =
      o && o.pct !== null ? { pct: o.pct, tone: o.state, line: describe(o), present: o.attended, total: o.total, target, subjects: subjectsAt } : null;

    // Friends: the latest chats, unread, and who is free right now.
    const me = chatMe();
    const nameOf = (id: string) => people.get(id)?.name ?? "Someone";
    const friendsPart = me
      ? {
          unread: (threads ?? []).reduce((n, t) => n + (t.muted ? 0 : t.unread), 0),
          chats: recent.map((t) => {
            const gid = t.thread.startsWith("g:") ? t.thread.slice(2) : null;
            const g = gid ? (groups ?? []).find((x) => x.id === gid) : null;
            const other = gid ? null : otherIn(t.thread, me);
            const photo = (g ? g.photo : other ? people.get(other)?.avatar : undefined) ?? "";
            return {
              thread: t.thread,
              name: g ? g.name : other ? nameOf(other) : "Chat",
              emoji: g && !g.photo && g.emoji ? `${g.emoji} ` : "",
              photo: smallPhotos.get(photo) || null,
              last: gist(t.last, me, nameOf, !!gid).slice(0, 80),
              at: t.last.createdAt,
              unread: t.muted ? 0 : t.unread,
            };
          }),
          free: (() => {
            const now = new Date();
            const mins = now.getHours() * 60 + now.getMinutes();
            const names = (friendRows ?? [])
              .filter((f) => {
                const s = stats?.get(f.id);
                if (!s?.today || s.today.date !== today) return false;
                return !s.today.classes.some((k) => {
                  const a = toMinutes(k.from), b = toMinutes(k.to);
                  return a !== null && b !== null && a <= mins && mins < b;
                });
              })
              .map((f) => f.name.split(" ")[0]);
            if (!names.length) return "";
            return names.length <= 3 ? `${names.join(", ")} ${names.length === 1 ? "is" : "are"} free now` : `${names.slice(0, 2).join(", ")} +${names.length - 2} are free now`;
          })(),
        }
      : null;

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
      // Light unless chosen otherwise (Profile → Appearance).
      theme: profile?.widgetTheme ?? "light",
      att,
      classes,
      tasks: { pending: tasks.length, list: list.map((t) => ({ title: t.title, kind: t.kind, date: t.dueDate, time: t.dueTime })) },
      friends: friendsPart,
      mess: { date: today, meals },
      // The pass opens full screen from its widget, offline too: the QR big, and whose it is.
      pass: pass && pass.value === qrValue ? pass.png : null,
      passName: profile?.name?.trim() ?? "",
      passSub: profile?.roll?.trim() ?? "",
      passPlace: camu?.cafeteria?.facility || "Cafeteria",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick: re-work "free now" as time passes
  }, [profile, tasks, data, target, subjects, slots, camu, today, pass, qrValue, threads, recent, people, groups, friendRows, stats, smallPhotos, photoVersion, tick]);

  useEffect(() => {
    if (!summary) return;
    const t = window.setTimeout(() => setWidgets(summary), 1500);
    return () => window.clearTimeout(t);
  }, [summary]);

  return null;
}
