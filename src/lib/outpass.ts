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

/** A clock time found in the words, before am/pm is settled. */
interface Clock {
  h: number;
  m: number;
  ap: "am" | "pm" | null;
}

/** One time the words left open: tap one of `options` ("HH:MM", 24h). */
export interface TimeAsk {
  which: "from" | "to";
  /** As written, e.g. "6:00" — for "6 AM or 6 PM?" */
  said: string;
  options: string[];
  /** The likelier one, already in the draft. */
  picked: string;
}

/** What one line of words turned into, and what is still worth a tap. */
export interface PassReading {
  draft: PassDraft;
  /** Times written without am/pm where both make sense. */
  asks: TimeAsk[];
  /** A day out with no start time: offer a few. */
  needStart: boolean;
  /** Was a reason written (or clearly implied, like "market")? */
  reasonGiven: boolean;
  /** Pieces that were understood, in order, for "Got it" chips. */
  heard: string[];
}

/** Reason chips: what students actually put on a pass. */
export const REASONS: Record<PassKind, string[]> = {
  dayout: ["Outing", "Walking", "Market", "Shopping", "Food outside", "Movie", "Bank work", "Doctor visit"],
  leave: ["Going home", "Family function", "Festival", "Medical", "Personal work", "College event"],
};

/** Words that already say why. First match wins; order matters ("doctor" before "outing"). */
const REASON_WORDS: [RegExp, string][] = [
  [/\b(doctor|hospital|checkup|clinic|dentist)\b/, "Doctor visit"],
  [/\b(bank|atm)\b/, "Bank work"],
  [/\b(movie|film|cinema|picture dekhne)\b/, "Movie"],
  [/\b(shopping|mall|kapde|clothes)\b/, "Shopping"],
  [/\b(market|bazaar|bazar|grocery|saman|samaan)\b/, "Market"],
  [/\b(khana|khane|food|dinner|lunch|restaurant|cafe)\b/, "Food outside"],
  [/\b(walk|walking|tehelne|tahalne|ghoomne|ghumne|ghoomna|ghumna)\b/, "Walking"],
  [/\b(parcel|courier|delivery)\b/, "Collect a parcel"],
  [/\b(haircut|salon|baal)\b/, "Haircut"],
  [/\b(shaadi|shadi|wedding|function)\b/, "Family function"],
  [/\b(diwali|holi|eid|festival|tyohar|chhath|rakhi)\b/, "Festival"],
  [/\b(ghar|home)\b/, "Going home"],
  [/\b(outing|trip|friends)\b/, "Outing"],
];

const AM_WORDS = "subah|subha|savere|sawere|morning|mrng";
const PM_WORDS = "shaam|sham|evening|raat|night|dopahar|dophar|dopehar|afternoon|noon";
const AM_RE = new RegExp(`\\b(?:${AM_WORDS})\\b`);
const PM_RE = new RegExp(`\\b(?:${PM_WORDS})\\b`);
const AFTER_RE = new RegExp(`^\\s*(?:ko\\s+|ki\\s+|ke\\s+)?(${AM_WORDS}|${PM_WORDS})\\b`);

/** A day out must sit between these (gate opens / closes). */
const DAYOUT_START = "06:00";

const asTime = (c: Clock, ap: "am" | "pm") => to24({ ...c, ap }, ap);

/** Which of am / pm make sense for this clock, given the pass kind and the other end. */
function fits(c: Clock, which: "from" | "to", kind: PassKind, other: string | null): ("am" | "pm")[] {
  if (c.h === 0) return ["am"];
  return (["am", "pm"] as const).filter((ap) => {
    const t = asTime(c, ap);
    if (kind === "dayout") {
      if (which === "from" && (t < DAYOUT_START || t >= DAYOUT_END)) return false;
      if (which === "to" && (t <= DAYOUT_START || t > DAYOUT_END)) return false;
    }
    if (other && kind === "dayout") {
      if (which === "to" && t <= other) return false;
      if (which === "from" && t >= other) return false;
    }
    return true;
  });
}

export function parsePass(text: string, now: Date = new Date()): PassDraft {
  return readPass(text, now).draft;
}

/**
 * The same reading as {@link parsePass}, plus what it was not sure of: a time
 * with no am/pm where both fit becomes a two-button question instead of a guess.
 */
export function readPass(text: string, now: Date = new Date()): PassReading {
  const today = toDateStr(now);
  let t = ` ${text.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ")} `;
  const heard: string[] = [];

  // ---- reason: whatever follows "for / because / reason / kyunki / due to"
  let reason = "";
  const rm = t.match(/\b(?:for|because|reason|kyunki|kyuki|due to|coz|wajah)\b[: ]+(.+)$/);
  if (rm) {
    reason = rm[1].trim().replace(/\s+/g, " ");
    reason = reason.charAt(0).toUpperCase() + reason.slice(1);
    t = t.slice(0, rm.index) + " ";
  }
  if (!reason) reason = REASON_WORDS.find(([re]) => re.test(t))?.[1] ?? "";

  // ---- kind + leave type
  const medical = /\b(medical|sick|bimar|fever|hospital|checkup)\b/.test(t);
  const duty = /\b(on ?duty|od|event|competition|hackathon|fest)\b/.test(t);
  const leaveType: LeaveType = medical ? "Medical" : duty ? "On Duty" : "Leave";
  const saysDayOut = /\b(day ?out|dayout|outing|outpass|out pass|gate ?pass|bahar)\b/.test(t);
  const saysLeave = /\b(leave|chutti|chhutti)\b/.test(t);
  // Going home, being ill or on duty usually means a leave — unless a day out was asked for.
  const leanLeave = /\b(ghar|home)\b/.test(t) || medical || duty;
  const nowish = /\b(abhi|abi|now|turant|right now)\b/.test(t);

  // ---- durations: "3 din", "2 days", "3 ghante" — these numbers are not dates
  let days = 0;
  let hours = 0;
  t = t.replace(/\b(\d{1,2})\s*(din|days?)\b/g, (_a, n) => {
    days = Number(n);
    return " ";
  });
  t = t.replace(/\b(\d{1,2})\s*(ghante|ghanta|ghante ke liye|hours?|hrs?)\b/g, (_a, n) => {
    hours = Number(n);
    return " ";
  });

  // ---- clock times: need am/pm, a colon/dot, or "baje" — so "6-10" stays dates
  const clocks: Clock[] = [];
  const src = t;
  t = t.replace(
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|baje|bje|bajhe)\b|\b(\d{1,2})[:.](\d{2})\b/g,
    (all: string, h1: string, m1: string, suf: string, h2: string, m2: string, at: number) => {
      const h = Number(h1 ?? h2);
      const m = Number(m1 ?? m2 ?? 0);
      if (h > 23 || m > 59) return all;
      let ap: Clock["ap"] = suf === "am" || suf === "pm" ? suf : h > 12 ? "pm" : null;
      if (!ap) {
        // "subah 10 baje", "10 baje subah", "shaam 6" — a time-of-day word settles it.
        const before = src.slice(Math.max(0, at - 14), at);
        const after = src.slice(at + all.length).match(AFTER_RE)?.[1];
        const lastAm = before.search(new RegExp(`(?:${AM_WORDS})\\s*(?:ko\\s*)?(?:\\d|$)`));
        const lastPm = before.search(new RegExp(`(?:${PM_WORDS})\\s*(?:ko\\s*)?(?:\\d|$)`));
        if (lastAm >= 0 || lastPm >= 0) ap = lastPm > lastAm ? "pm" : "am";
        else if (after) ap = AM_RE.test(after) ? "am" : PM_RE.test(after) ? "pm" : null;
      }
      clocks.push({ h: h > 12 ? h - 12 : h, m, ap });
      return " @ ";
    },
  );
  // A range written "3-7pm" leaves "3-@" behind — pick the bare hour up as the start.
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

  const multiDay = (dates.length === 2 && dates[0] !== dates[1]) || days > 1;
  const kind: PassKind = saysLeave || multiDay ? "leave" : saysDayOut ? "dayout" : leanLeave ? "leave" : "dayout";
  heard.push(kind === "dayout" ? "Day Out" : leaveType === "Leave" ? "Leave" : `${leaveType} leave`);

  // ---- am / pm: settle what the words settle, ask about the rest
  const asks: TimeAsk[] = [];
  const settle = (c: Clock | undefined, which: "from" | "to", other: string | null): string | null => {
    if (!c) return null;
    if (c.ap) return asTime(c, c.ap);
    const ok = fits(c, which, kind, other);
    const guess = guessAp(c.h);
    if (ok.length === 1) return asTime(c, ok[0]);
    const pick = ok.includes(guess) || ok.length === 0 ? guess : ok[0];
    const picked = asTime(c, pick);
    if (ok.length === 2) {
      asks.push({ which, said: `${c.h}:${pad(c.m)}`, options: [asTime(c, "am"), asTime(c, "pm")], picked });
    }
    return picked;
  };
  const [start, end] = clocks;
  // "2:40-7pm": the start shares the end's pm when it comes before it.
  if (start && !start.ap && end?.ap === "pm" && end.h !== 12 && start.h <= end.h) start.ap = "pm";
  const endFirst = end?.ap ? asTime(end, end.ap) : null;
  let fromT = settle(start, "from", endFirst);
  const toT = settle(end, "to", fromT);

  if (kind === "dayout") {
    const day = dates[0] ?? base;
    if (nowish && !fromT) fromT = soon(now);
    let fromTime = fromT ?? (day === today ? soon(now) : "10:00");
    let toTime = toT ?? (hours && fromT ? addHours(fromT, hours) : DAYOUT_END);
    if (toTime > DAYOUT_END) toTime = DAYOUT_END;
    if (fromTime >= toTime) fromTime = soon(now) < toTime ? soon(now) : "10:00";
    heard.push(day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : dayLabel(day));
    heard.push(`${fmtTime(fromTime)} → ${fmtTime(toTime)}`);
    if (reason) heard.push(reason);
    return {
      draft: { kind, leaveType: "Leave", fromDate: day, fromTime, toDate: day, toTime, reason },
      asks,
      needStart: !fromT,
      reasonGiven: !!reason,
      heard,
    };
  }

  const fromDate = dates[0] ?? base;
  let toDate = dates[1] ?? (days > 1 ? addDays(fromDate, days - 1) : dates[0] ?? base);
  if (toDate < fromDate) toDate = fromDate;
  const fromTime = fromT ?? "08:00";
  const toTime = toT ?? DAYOUT_END;
  heard.push(fromDate === toDate ? dayLabel(fromDate) : `${dayLabel(fromDate)} → ${dayLabel(toDate)}`);
  if (fromT || toT) heard.push(`${fmtTime(fromTime)} → ${fmtTime(toTime)}`);
  if (reason) heard.push(reason);
  return {
    draft: { kind, leaveType, fromDate, fromTime, toDate, toTime, reason },
    asks,
    needStart: false,
    reasonGiven: !!reason,
    heard,
  };
}

function addHours(t: string, n: number): string {
  const [h, m] = t.split(":").map(Number);
  const mins = Math.min(h * 60 + m + n * 60, 23 * 60 + 59);
  return hm(Math.floor(mins / 60), mins % 60);
}

function dayLabel(s: string): string {
  return fromDateStr(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** A few start times for a day out on `day`: now-ish, then the next round hours. */
export function startChoices(day: string, now: Date = new Date()): string[] {
  const out: string[] = [];
  if (day === toDateStr(now)) {
    const s = soon(now);
    if (s < DAYOUT_END) out.push(s);
    for (let h = now.getHours() + 1; h <= 18 && out.length < 4; h++) {
      const x = hm(h, 0);
      if (x > (out[0] ?? "00:00") && x >= DAYOUT_START) out.push(x);
    }
  } else out.push("09:00", "11:00", "13:00", "15:00");
  return out;
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
