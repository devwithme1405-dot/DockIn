import { addDays, fromDateStr, toDateStr, fmtTime } from "./dates";

/**
 * Leave + gate pass, from one line of plain words.
 *
 * "2:40pm-7pm day outpass", "kal 3 baje day out", "6-10 leave",
 * "medical leave 6 dec to 9 dec for fever" — turned into the fields Camu's
 * "Apply Leave and Gate Pass" form asks for. Rule-based on purpose: free,
 * instant, offline, and predictable; the confirm screen fixes anything it
 * guessed wrong before anything is sent.
 */

export type PassKind = "dayout" | "leave";
export type LeaveType = "Leave" | "On Duty" | "Medical";

export interface PassDraft {
  kind: PassKind;
  leaveType: LeaveType;
  /** "YYYY-MM-DD" */
  fromDate: string;
  /** "HH:MM" 24h */
  fromTime: string;
  toDate: string;
  toTime: string;
  reason: string;
}

/** A day out pass always ends at 7 PM (college rule). */
export const DAYOUT_END = "19:00";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type Clock = { h: number; m: number; ap: "am" | "pm" | null };

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

function to24(c: Clock, fallback: "am" | "pm"): string {
  const ap = c.ap ?? fallback;
  let h = c.h % 12;
  if (ap === "pm") h += 12;
  return hm(h, c.m);
}

/** College hours: a bare 1–7 is afternoon, 8–11 is morning, 12 is noon. */
function guessAp(h: number): "am" | "pm" {
  return h >= 8 && h <= 11 ? "am" : "pm";
}

/** The next time on the clock after now, rounded up to 10 minutes. */
function soon(now: Date): string {
  const mins = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 10) * 10;
  const m = Math.min(mins, 18 * 60 + 50);
  return hm(Math.floor(m / 60), m % 60);
}

export function parsePass(text: string, now: Date = new Date()): PassDraft {
  const today = toDateStr(now);
  let t = ` ${text.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ")} `;

  // ---- reason: whatever follows "for / because / reason / kyunki / due to"
  let reason = ".";
  const rm = t.match(/\b(?:for|because|reason|kyunki|kyuki|due to|coz)\b[: ]+(.+)$/);
  if (rm) {
    reason = rm[1].trim().replace(/\s+/g, " ");
    reason = reason.charAt(0).toUpperCase() + reason.slice(1);
    t = t.slice(0, rm.index) + " ";
  }

  // ---- kind + leave type
  const medical = /\b(medical|doctor|hospital|sick|bimar|fever|checkup)\b/.test(t);
  const duty = /\b(on ?duty|od|event|competition|hackathon|fest)\b/.test(t);
  const leaveType: LeaveType = medical ? "Medical" : duty ? "On Duty" : "Leave";
  const saysDayOut = /\b(day ?out|outing|outpass|out pass|gate ?pass|bahar)\b/.test(t);
  const saysLeave = /\b(leave|ghar|home|chutti|chhutti)\b/.test(t) || medical || duty;

  // ---- clock times: need am/pm, a colon/dot, or "baje" — so "6-10" stays dates
  const clocks: Clock[] = [];
  t = t.replace(
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|baje|bje)\b|\b(\d{1,2})[:.](\d{2})\b/g,
    (_all, h1, m1, suf, h2, m2) => {
      const h = Number(h1 ?? h2);
      const m = Number(m1 ?? m2 ?? 0);
      if (h > 23 || m > 59) return _all;
      const ap = suf === "am" || suf === "pm" ? suf : h > 12 ? "pm" : null;
      clocks.push({ h: h > 12 ? h - 12 : h, m, ap });
      return " @ ";
    },
  );
  // "se 3 tak 7" style leftovers are rare; a range written "3-7pm" leaves "3-@"
  // behind — pick the bare hour up as the start.
  const lead = t.match(/\b(\d{1,2})\s*(?:-|to|se)\s*@/);
  if (lead && clocks.length === 1) {
    const h = Number(lead[1]);
    if (h >= 1 && h <= 12) {
      clocks.unshift({ h, m: 0, ap: null });
      t = t.replace(lead[0], " @ - @");
    }
  }

  // ---- the day: words first
  let base = today;
  if (/\b(day after|parso|parson)\b/.test(t)) base = addDays(today, 2);
  else if (/\b(tomorrow|tmrw|kal)\b/.test(t)) base = addDays(today, 1);
  else {
    const wd = t.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
    if (wd) {
      const want = WEEKDAYS.indexOf(wd[1]);
      const d = (want - now.getDay() + 7) % 7 || 7;
      base = addDays(today, d);
    }
  }

  // ---- calendar dates: "6-10", "6 to 10 dec", "6 dec - 9 dec", "6/12"
  const monthOf = (s: string | undefined): number | null => {
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return n >= 1 && n <= 12 ? n - 1 : null;
    }
    const i = MONTHS.indexOf(s.slice(0, 3));
    return i >= 0 ? i : null;
  };
  const found: { d: number; mo: number | null }[] = [];
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?(?:\/(\d{1,2}))?(?:\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)?\b/g)) {
    const d = Number(m[1]);
    if (d < 1 || d > 31) continue;
    found.push({ d, mo: monthOf(m[2] ?? m[3]) });
  }
  // A month written once ("6 to 10 dec") belongs to both ends.
  const anyMonth = found.find((f) => f.mo !== null)?.mo ?? null;
  const dates: string[] = [];
  const [f1, f2] = found;
  if (f1) {
    // No month: this month, or next month if that day has already gone.
    const mo = f1.mo ?? anyMonth ?? (f1.d < now.getDate() ? now.getMonth() + 1 : now.getMonth());
    let first = new Date(now.getFullYear(), mo, f1.d);
    if (toDateStr(first) < today) first = new Date(first.getFullYear() + 1, first.getMonth(), f1.d);
    dates.push(toDateStr(first));
    if (f2) {
      let second = new Date(first.getFullYear(), f2.mo ?? anyMonth ?? first.getMonth(), f2.d);
      if (second < first)
        second = f2.mo === null
          ? new Date(first.getFullYear(), first.getMonth() + 1, f2.d)
          : new Date(first.getFullYear() + 1, second.getMonth(), f2.d);
      dates.push(toDateStr(second));
    }
  }

  const multiDay = dates.length === 2 && dates[0] !== dates[1];
  const kind: PassKind = saysDayOut && !saysLeave ? "dayout" : saysLeave || multiDay ? "leave" : "dayout";

  // ---- times, with am/pm filled in sensibly
  const end = clocks[1];
  const start = clocks[0];
  // "2:40-7pm": the start shares the end's pm when it comes before it.
  const startAp: "am" | "pm" =
    start?.ap ?? (start && end?.ap === "pm" && end.h !== 12 && start.h <= end.h ? "pm" : guessAp(start?.h ?? 9));

  if (kind === "dayout") {
    const day = dates[0] ?? base;
    let fromTime = start ? to24(start, startAp) : day === today ? soon(now) : "10:00";
    let toTime = end ? to24(end, end.ap ?? guessAp(end.h)) : DAYOUT_END;
    if (toTime > DAYOUT_END) toTime = DAYOUT_END;
    if (fromTime >= toTime) fromTime = soon(now) < toTime ? soon(now) : "10:00";
    return { kind, leaveType: "Leave", fromDate: day, fromTime, toDate: day, toTime, reason };
  }

  const fromDate = dates[0] ?? base;
  const toDate = dates[1] ?? dates[0] ?? base;
  return {
    kind,
    leaveType,
    fromDate,
    fromTime: start ? to24(start, startAp) : "08:00",
    toDate: toDate < fromDate ? fromDate : toDate,
    toTime: end ? to24(end, end.ap ?? guessAp(end.h)) : DAYOUT_END,
    reason,
  };
}

/** One line for Camu's top bar: what to fill in, in the order the form asks. */
export function passSummary(p: PassDraft): string {
  const day = (s: string) =>
    fromDateStr(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (p.kind === "dayout")
    return `Day Out Pass · ${day(p.fromDate)} · ${fmtTime(p.fromTime)} → ${fmtTime(p.toTime)} · Reason "${p.reason}"`;
  return `${p.leaveType} ${day(p.fromDate)} → ${day(p.toDate)} · Leave Out Pass ${fmtTime(p.fromTime)} → ${fmtTime(p.toTime)} · Reason "${p.reason}"`;
}

/** Camu wants the parent-approval mail screenshot for a plain leave. */
export function needsProof(p: PassDraft): boolean {
  return p.kind === "leave" && p.leaveType !== "On Duty";
}
