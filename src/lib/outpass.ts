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

/** Every pass (day out and leave out) ends by 7 PM — MyCamu refuses later. */
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

/** Passes (day out and leave out) run 6:00 am – 7:00 pm; MyCamu refuses anything else. */
export const PASS_START = "06:00";

/** The next time on the clock after now, rounded up to 10 minutes, inside pass hours. */
function soon(now: Date): string {
  const mins = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 10) * 10;
  const m = Math.max(6 * 60, Math.min(mins, 18 * 60 + 50));
  return hm(Math.floor(m / 60), m % 60);
}

/** A clock time found in the words, before am/pm is settled. */
interface Clock {
  h: number;
  m: number;
  ap: "am" | "pm" | null;
}

/** A time written without am/pm: one tap to settle it. */
export interface TimeAsk {
  which: "from" | "to";
  /** As written, e.g. "6:00" — for "6:00 AM or PM?" */
  said: string;
  /** ["HH:MM" am, "HH:MM" pm] */
  options: string[];
  /** Which of `options` a pass can have (6 am – 7 pm, back after out). */
  valid: boolean[];
  /** Already in the draft: the only valid one, or the likelier. */
  picked: string;
  /** Both fit: the pass can't go until this is answered. */
  must: boolean;
}

/** What one line of words turned into, and what is still worth a tap. */
export interface PassReading {
  draft: PassDraft;
  /** Times written without am/pm. */
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
  [/\b(doctor|docter|dr|hospital|checkup|clinic|dentist|dawai|medicine)\b/, "Doctor visit"],
  [/\b(bank|atm|paise nikalne)\b/, "Bank work"],
  [/\b(movie|movi|mvie|film|cinema|picture dekhne|pvr)\b/, "Movie"],
  [/\b(shopping|shoping|shpng|mall|kapde|kapda|clothes)\b/, "Shopping"],
  [/\b(market|markit|mkt|mrkt|bzr|bazaar|bazar|grocery|saman|samaan|stationery|stationary)\b/, "Market"],
  [/\b(khana|khane|food|dinner|lunch|breakfast|restaurant|cafe|dhaba)\b/, "Food outside"],
  [/\b(walk|walking|wlk|tehelne|tahalne|ghoomne|ghumne|ghoomna|ghumna|ghumke)\b/, "Walking"],
  [/\b(parcel|courier|delivery|amazon|flipkart)\b/, "Collect a parcel"],
  [/\b(haircut|salon|parlour|parlor|baal katwane)\b/, "Haircut"],
  [/\b(shaadi|shadi|wedding|function|marriage)\b/, "Family function"],
  [/\b(diwali|holi|eid|festival|tyohar|chhath|rakhi|christmas)\b/, "Festival"],
  [/\b(ghar|home)\b/, "Going home"],
  [/\b(outing|trip|friends|dosto|doston)\b/, "Outing"],
];

/** Common ways the same word gets typed (in a hurry, on a phone). */
const SPELLINGS: [RegExp, string][] = [
  [/\b(kl|kall|kaal|kaali)\b/g, "kal"],
  [/\b(tmr|tmrw|tmrow|tomorow|tommorow|tommorrow|tomarrow|tomorro|tommorow|2mrw|2moro)\b/g, "tomorrow"],
  [/\b(parsu|parsoon|prso|parson|parsoo)\b/g, "parso"],
  [/\b(aj|aaj|ajj|today|tday)\b/g, "aaj"],
  [/\b(bje|bjey|bajey|bajay|baj|bjay|bjh|bajhe|bajje|bjee|bajee|o'?clock)\b/g, "baje"],
  [/\b(subh|subha|sbh|subeh|savere|sawere|savera|morning|mrng|morng|mornin)\b/g, "subah"],
  [/\b(shm|sham|shyaam|evening|eve|evng|evening)\b/g, "shaam"],
  [/\b(dophar|dopahar|dupahar|dopehar|dpahar|dopaher|afternoon|aftrnoon)\b/g, "dopahar"],
  [/\b(rat|raat|night|nite|raatko)\b/g, "raat"],
  [/\b(sy|say|seh|sey|frm|from)\b/g, "se"],
  [/\b(tk|tkk|takk|till|untill|until|upto|tll|tak)\b/g, "tak"],
  [/\b(dyout|dayot|deyout|dayoutpass|day-out|dayout)\b/g, "dayout"],
  [/\b(outpas|outpaas|outpss|autpass|out-pass)\b/g, "outpass"],
  [/\b(gatepas|gate-pass)\b/g, "gatepass"],
  [/\b(leav|leve|leaev|leavee|lev)\b/g, "leave"],
  [/\b(chuti|chhuti|chutti|chhutti)\b/g, "chutti"],
  [/\b(abi|abhee|abhi|now|turant|right now|rn)\b/g, "abhi"],
];

const NUMBER_WORDS: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, tin: 3, three: 3, char: 4, chaar: 4, four: 4,
  panch: 5, paanch: 5, five: 5, chhe: 6, che: 6, chah: 6, chhah: 6, six: 6, saat: 7, seven: 7,
  aath: 8, ath: 8, eight: 8, nau: 9, nine: 9, das: 10, dus: 10, ten: 10,
  gyarah: 11, gyara: 11, gyaarah: 11, eleven: 11, barah: 12, bara: 12, baarah: 12, twelve: 12,
};
const NUMS = Object.keys(NUMBER_WORDS).join("|");

/** Lower-case, fixed spellings, number words and "saade 4" made into plain clocks. */
export function normalisePass(raw: string): string {
  let t = ` ${raw.toLowerCase().replace(/[–—]/g, "-").replace(/[,!?;"'()]/g, " ").replace(/\s+/g, " ")} `;
  for (const [re, to] of SPELLINGS) t = t.replace(re, to);
  // "saat baje", "das se paanch", "teen tak" — number words only next to time words.
  t = t.replace(new RegExp(`\\b(${NUMS})\\b(?=\\s*(?:baje|am|pm|se|tak|to|-|:))`, "g"), (w) => String(NUMBER_WORDS[w]));
  t = t.replace(new RegExp(`(?<=\\b(?:se|tak|to|-)\\s*)\\b(${NUMS})\\b`, "g"), (w) => String(NUMBER_WORDS[w]));
  // saade 4 = 4:30 · sawa 5 = 5:15 · paune 6 = 5:45 · dedh = 1:30 · dhai = 2:30
  t = t.replace(/\b(saade|sade|sadhe|saadhe)\s*(\d{1,2})\b/g, (_a, _w, h) => `${h}:30`);
  t = t.replace(/\b(sawa|sava|sawaa)\s*(\d{1,2})\b/g, (_a, _w, h) => `${h}:15`);
  t = t.replace(/\b(paune|pone|paun)\s*(\d{1,2})\b/g, (_a, _w, h) => `${Math.max(Number(h) - 1, 0) || 12}:45`);
  t = t.replace(/\bdedh\b/g, "1:30").replace(/\b(dhai|dhaai|adhai)\b/g, "2:30");
  t = t.replace(/\bhalf past (\d{1,2})\b/g, "$1:30").replace(/\bquarter past (\d{1,2})\b/g, "$1:15");
  t = t.replace(/\b(\d{1,2}) (?:and|n|&) half\b/g, "$1:30");
  t = t.replace(/\b12 ?noon\b|\bnoon\b/g, " 12pm ");
  // "430pm" → "4:30pm", "4p" → "4pm", "4 p.m." → "4pm"
  t = t.replace(/\b(\d{1,2})(\d{2})\s*(am|pm)\b/g, "$1:$2$3");
  t = t.replace(/\b(\d{1,2}(?::\d{2})?)\s*([ap])\.?\s*m\.?(?=\s|$)/g, "$1$2m");
  t = t.replace(/\b(\d{1,2}(?::\d{2})?)\s*([ap])(?=\s|$)/g, "$1$2m");
  return t.replace(/\s+/g, " ");
}

const AM_WORDS = "subah";
const PM_WORDS = "shaam|raat|dopahar";
const AM_RE = new RegExp(`\\b(?:${AM_WORDS})\\b`);
const PM_RE = new RegExp(`\\b(?:${PM_WORDS})\\b`);
const AFTER_RE = new RegExp(`^\\s*(?:ko\\s+|ki\\s+|ke\\s+)?(${AM_WORDS}|${PM_WORDS})\\b`);

const asTime = (c: Clock, ap: "am" | "pm") => to24({ ...c, ap }, ap);

/** Can this clock be `which` end of a pass, as am / pm? 6 am – 7 pm, back after out on the same day. */
function fitsAs(c: Clock, ap: "am" | "pm", which: "from" | "to", other: string | null): boolean {
  if (c.h === 0 && ap === "pm") return false;
  const t = asTime(c, ap);
  if (which === "from" && (t < PASS_START || t >= DAYOUT_END)) return false;
  if (which === "to" && (t <= PASS_START || t > DAYOUT_END)) return false;
  if (other && which === "to" && t <= other) return false;
  if (other && which === "from" && t >= other) return false;
  return true;
}

export function parsePass(text: string, now: Date = new Date()): PassDraft {
  return readPass(text, now).draft;
}

/**
 * One line of words, however hurried ("kl 11 se 7 mkt jana h"), into a pass.
 * Every time written without am/pm becomes a one-tap question; where only one
 * fits pass hours (6 am – 7 pm) it is already picked, where both fit the pass
 * waits for the tap. Nothing after 7 pm is ever filled in.
 */
export function readPass(text: string, now: Date = new Date()): PassReading {
  const today = toDateStr(now);
  let t = normalisePass(text);
  const heard: string[] = [];

  // ---- reason: whatever follows "for / because / reason / kyunki / due to"
  let reason = "";
  const rm = t.match(/\b(?:for|because|reason|kyunki|kyuki|kyoki|due to|coz|cuz|wajah)\b[: ]+(.+)$/);
  if (rm) {
    reason = rm[1].trim().replace(/\s+/g, " ");
    reason = reason.charAt(0).toUpperCase() + reason.slice(1);
    t = t.slice(0, rm.index) + " ";
  }
  if (!reason) reason = REASON_WORDS.find(([re]) => re.test(t))?.[1] ?? "";

  // ---- kind + leave type
  const medical = /\b(medical|sick|bimar|beemar|fever|bukhar|hospital|checkup)\b/.test(t);
  const duty = /\b(on ?duty|od|event|competition|hackathon|fest)\b/.test(t);
  const leaveType: LeaveType = medical ? "Medical" : duty ? "On Duty" : "Leave";
  const saysDayOut = /\b(dayout|day out|outing|outpass|out pass|gatepass|gate pass|bahar|baahar)\b/.test(t);
  const saysLeave = /\b(leave|chutti)\b/.test(t);
  const leanLeave = /\b(ghar|home)\b/.test(t) || medical || duty;
  const nowish = /\babhi\b/.test(t);
  const dayWord = /\b(aaj|kal|tomorrow|parso|day after|sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/.test(t) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.test(t);

  // ---- durations: "3 din", "2 days", "3 ghante" — these numbers are not dates
  let days = 0;
  let hours = 0;
  t = t.replace(/\b(\d{1,2})\s*(din|days?|dino)\b/g, (_a, n) => {
    days = Number(n);
    return " ";
  });
  t = t.replace(/\b(\d{1,2})\s*(ghante|ghanta|ghanto|hours?|hrs?)\b/g, (_a, n) => {
    hours = Number(n);
    return " ";
  });

  // ---- clock times with a mark: am/pm, a colon/dot, or "baje"
  const clocks: (Clock & { at: number })[] = [];
  const src = t;
  const contextAp = (at: number, len: number): Clock["ap"] => {
    const before = src.slice(Math.max(0, at - 16), at);
    const after = src.slice(at + len).match(AFTER_RE)?.[1];
    const lastAm = before.search(new RegExp(`(?:${AM_WORDS})\\s*(?:ko\\s*|ke\\s*)?(?:\\d|$)`));
    const lastPm = before.search(new RegExp(`(?:${PM_WORDS})\\s*(?:ko\\s*|ke\\s*)?(?:\\d|$)`));
    if (lastAm >= 0 || lastPm >= 0) return lastPm > lastAm ? "pm" : "am";
    if (after) return AM_RE.test(after) ? "am" : PM_RE.test(after) ? "pm" : null;
    return null;
  };
  t = t.replace(
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|baje)\b|\b(\d{1,2})[:.](\d{2})\b/g,
    (all: string, h1: string, m1: string, suf: string, h2: string, m2: string, at: number) => {
      const h = Number(h1 ?? h2);
      const m = Number(m1 ?? m2 ?? 0);
      if (h > 23 || m > 59) return all;
      const ap: Clock["ap"] = suf === "am" || suf === "pm" ? suf : h > 12 || h === 0 ? (h === 0 ? "am" : "pm") : contextAp(at, all.length);
      clocks.push({ h: h > 12 ? h - 12 : h, m, ap, at });
      return " @ ";
    },
  );
  // "3-7pm", "11 se 7 baje": the bare start of a marked range is a time too.
  const lead = t.match(/\b(\d{1,2})\s*(?:-|to|se)\s*@/);
  if (lead) {
    const h = Number(lead[1]);
    const at = src.indexOf(lead[0]);
    if (h >= 1 && h <= 12) {
      clocks.push({ h, m: 0, ap: contextAp(at, lead[1].length), at: at < 0 ? -1 : at });
      t = t.replace(lead[0], " @ - @");
    }
  }
  // "11 se 7", "4 to 6", "11-7 tak" with nothing else: times on a day out, or
  // when a day is already named — a leave's "6-10" stays dates.
  if (!clocks.length && (!(saysLeave || leanLeave) || dayWord)) {
    const bare = t.match(/\b(\d{1,2})\s*(?:-|to|se)\s*(\d{1,2})\b(?!\s*(?:\/|st\b|nd\b|rd\b|th\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/);
    if (bare && Number(bare[1]) >= 1 && Number(bare[1]) <= 12 && Number(bare[2]) >= 1 && Number(bare[2]) <= 12) {
      const at = src.indexOf(bare[0]);
      clocks.push({ h: Number(bare[1]), m: 0, ap: contextAp(at, bare[1].length), at });
      clocks.push({ h: Number(bare[2]), m: 0, ap: contextAp(at + bare[0].length - bare[2].length, bare[2].length), at: at + 1 });
      t = t.replace(bare[0], " @ - @ ");
    }
  }
  clocks.sort((a, b) => a.at - b.at);

  // ---- the day: words first
  let base = today;
  if (/\b(day after|parso)\b/.test(t)) base = addDays(today, 2);
  else if (/\b(tomorrow|kal)\b/.test(t)) base = addDays(today, 1);
  else if (!/\baaj\b/.test(t)) {
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
  const anyMonth = found.find((f) => f.mo !== null)?.mo ?? null;
  const dates: string[] = [];
  const [f1, f2] = found;
  if (f1) {
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

  const fromDate = dates[0] ?? base;
  let toDate = kind === "dayout" ? fromDate : dates[1] ?? (days > 1 ? addDays(fromDate, days - 1) : dates[0] ?? base);
  if (toDate < fromDate) toDate = fromDate;
  const sameDay = fromDate === toDate;

  // ---- am / pm: every unmarked time is a question; pass hours decide the answer when they can
  const asks: TimeAsk[] = [];
  const settle = (c: Clock | undefined, which: "from" | "to", other: string | null): string | null => {
    if (!c) return null;
    if (c.ap) return asTime(c, c.ap);
    const valid = (["am", "pm"] as const).map((ap) => fitsAs(c, ap, which, sameDay ? other : null));
    const guess = guessAp(c.h);
    const pick = valid[0] && valid[1] ? guess : valid[0] ? "am" : valid[1] ? "pm" : guess;
    const picked = asTime(c, pick);
    asks.push({ which, said: `${c.h}:${pad(c.m)}`, options: [asTime(c, "am"), asTime(c, "pm")], valid, picked, must: valid[0] && valid[1] });
    return picked;
  };
  const [start, end] = clocks;
  // "2:40-7pm": the start shares the end's pm when it comes before it.
  if (start && !start.ap && end?.ap === "pm" && end.h !== 12 && start.h <= end.h) start.ap = "pm";
  const endFirst = end?.ap ? asTime(end, end.ap) : null;
  let fromT = settle(start, "from", endFirst);
  const toT = settle(end, "to", fromT);
  if (nowish && !fromT && fromDate === today) fromT = soon(now);

  let fromTime = fromT ?? (kind === "dayout" ? (fromDate === today ? soon(now) : "10:00") : "08:00");
  let toTime = toT ?? (hours && fromT ? addHours(fromT, hours) : DAYOUT_END);
  if (toTime > DAYOUT_END) toTime = DAYOUT_END;
  if (fromTime < PASS_START) fromTime = PASS_START;
  if (sameDay && fromTime >= toTime && !toT) toTime = DAYOUT_END;

  heard.push(
    kind === "dayout" || sameDay
      ? fromDate === today
        ? "Today"
        : fromDate === addDays(today, 1)
          ? "Tomorrow"
          : dayLabel(fromDate)
      : `${dayLabel(fromDate)} → ${dayLabel(toDate)}`,
  );
  if (kind === "dayout" || fromT || toT) heard.push(`${fmtTime(fromTime)} → ${fmtTime(toTime)}`);
  if (reason) heard.push(reason);
  return {
    draft: { kind, leaveType: kind === "dayout" ? "Leave" : leaveType, fromDate, fromTime, toDate, toTime, reason },
    asks,
    needStart: kind === "dayout" && !fromT,
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
      if (x > (out[0] ?? "00:00") && x >= PASS_START) out.push(x);
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
