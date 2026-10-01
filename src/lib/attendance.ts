import type { AttendanceSummary, Session, Subject } from "./types";

/**
 * Attendance maths.
 *
 * With `a` attended and `t` held (weighted), target fraction `p`:
 *   - can still miss m classes while a / (t + m) >= p  ->  m = floor(a / p - t)
 *   - must attend n classes in a row so (a + n) / (t + n) >= p
 *                                              ->  n = ceil((p * t - a) / (1 - p))
 * Cancelled, holiday and unmarked classes are not counted.
 */
export function summarize(
  sessions: Pick<Session, "status" | "weight">[],
  targetPct: number,
): AttendanceSummary {
  let attended = 0;
  let total = 0;
  for (const s of sessions) {
    if (s.status === "present") {
      attended += s.weight;
      total += s.weight;
    } else if (s.status === "absent") {
      total += s.weight;
    }
  }

  if (total === 0) {
    return {
      attended: 0,
      total: 0,
      pct: null,
      canMiss: 0,
      mustAttend: 0,
      state: "none",
    };
  }

  const p = Math.min(Math.max(targetPct, 0), 100) / 100;
  const pct = (attended / total) * 100;
  const EPS = 1e-9;

  let canMiss = 0;
  let mustAttend = 0;
  if (p === 0) {
    canMiss = Infinity;
  } else if (attended / total + EPS >= p) {
    canMiss = Math.max(0, Math.floor(attended / p - total + EPS));
  } else if (p < 1) {
    mustAttend = Math.max(0, Math.ceil((p * total - attended) / (1 - p) - EPS));
  } else {
    mustAttend = Infinity;
  }

  let state: AttendanceSummary["state"];
  if (pct + EPS < targetPct) state = "danger";
  else if (canMiss < 2) state = "warn";
  else state = "safe";

  return { attended, total, pct, canMiss, mustAttend, state };
}

export function fmtPct(pct: number | null): string {
  if (pct === null) return "--";
  const r = Math.round(pct * 10) / 10;
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`;
}

/** One short, plain-language line describing a summary. */
export function describe(s: AttendanceSummary): string {
  if (s.state === "none") return "No classes marked yet";
  if (s.state === "danger") {
    return Number.isFinite(s.mustAttend)
      ? `Attend the next ${s.mustAttend} ${s.mustAttend === 1 ? "class" : "classes"}`
      : "Below target";
  }
  if (!Number.isFinite(s.canMiss)) return "Nothing to worry about";
  if (s.canMiss === 0) return "No bunk left. Attend the next class";
  return `Can miss ${s.canMiss} more ${s.canMiss === 1 ? "class" : "classes"}`;
}

type Weighted = Pick<Session, "status" | "weight">;

/** Sessions plus the "before DockIn" starting numbers of a subject. */
export function withBase(
  sessions: Weighted[],
  base: Pick<Subject, "baseAttended" | "baseTotal"> | undefined,
): Weighted[] {
  const total = base?.baseTotal ?? 0;
  const attended = Math.min(base?.baseAttended ?? 0, total);
  if (total <= 0) return sessions;
  const extra: Weighted[] = [{ status: "present", weight: attended }];
  if (total > attended) extra.push({ status: "absent", weight: total - attended });
  return [...extra, ...sessions];
}

// ---------- streak and trend ----------

interface Dated {
  date: string;
  status: Session["status"];
  weight: number;
}

/**
 * Marking streak: how many class days in a row are fully marked, counting back
 * from today. Today only counts once every class today is marked, and an
 * unfinished today never breaks the streak. Days with only cancelled/holiday
 * classes are skipped.
 */
export function computeStreak(
  sessions: Pick<Dated, "date" | "status">[],
  today: string,
): number {
  const byDate = new Map<string, Pick<Dated, "status">[]>();
  for (const s of sessions) {
    if (s.date > today) continue;
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  const dates = [...byDate.keys()].sort().reverse();
  let streak = 0;
  for (const d of dates) {
    const day = byDate.get(d)!;
    const allMarked = day.every((s) => s.status !== "unmarked");
    if (d === today && !allMarked) continue;
    if (!allMarked) break;
    const counted = day.some((s) => s.status === "present" || s.status === "absent");
    if (counted) streak += 1;
  }
  return streak;
}

export interface TrendPoint {
  /** Monday of that week, YYYY-MM-DD */
  week: string;
  pct: number;
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const shift = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - shift);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Cumulative attendance % at the end of each week that had a marked class. */
export function weeklyTrend(
  sessions: Dated[],
  base?: Pick<Subject, "baseAttended" | "baseTotal">,
): TrendPoint[] {
  let attended = Math.min(base?.baseAttended ?? 0, base?.baseTotal ?? 0);
  let total = base?.baseTotal ?? 0;
  const weeks = new Map<string, { a: number; t: number }>();
  for (const s of sessions) {
    if (s.status !== "present" && s.status !== "absent") continue;
    const w = mondayOf(s.date);
    const cur = weeks.get(w) ?? { a: 0, t: 0 };
    cur.t += s.weight;
    if (s.status === "present") cur.a += s.weight;
    weeks.set(w, cur);
  }
  const out: TrendPoint[] = [];
  for (const w of [...weeks.keys()].sort()) {
    const v = weeks.get(w)!;
    attended += v.a;
    total += v.t;
    if (total > 0) out.push({ week: w, pct: (attended / total) * 100 });
  }
  return out;
}

export function countCancelled(sessions: Pick<Session, "status">[]): number {
  return sessions.filter((s) => s.status === "cancelled").length;
}
