import type { FriendStatsData } from "./friendStats";

/**
 * "Who's free right now?" for Compare: each person's classes today (from what
 * they share), whether they're in one, when they're free next, which of their
 * classes nobody else in the list has, and the windows when everyone is free.
 */

export interface Slot {
  name: string;
  from: string;
  to: string;
  /** Minutes since midnight. */
  a: number;
  b: number;
  /** Nobody else in the list has this class at this time. */
  only: boolean;
}

export interface FreeRow<P> {
  p: P;
  /** null: this person's day isn't known (nothing shared for today). */
  slots: Slot[] | null;
  current: Slot | null;
  next: Slot | null;
  /** Free windows left today, [from, to] in minutes (≥ 15 min). */
  free: [number, number][];
}

const mins = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** "Database Management Systems ( P-LA-203 )" → "database management systems" */
export const plainName = (n: string) => n.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Their classes on `date`: the two-week list first, today's snapshot as a fallback. */
export function classesFor(s: FriendStatsData | null, date: string): { from: string; to: string; name: string }[] | null {
  if (!s) return null;
  if (s.week) return s.week[date] ?? [];
  if (s.today && s.today.date === date) return s.today.classes;
  return null;
}

const DAY_START = 8 * 60;
const DAY_END = 18 * 60;

function gaps(busy: [number, number][], from: number, min = 15): [number, number][] {
  const out: [number, number][] = [];
  let t = Math.max(from, DAY_START);
  for (const [a, b] of [...busy].sort((x, y) => x[0] - y[0])) {
    if (a - t >= min && a <= DAY_END) out.push([t, Math.min(a, DAY_END)]);
    t = Math.max(t, b);
  }
  if (DAY_END - t >= min) out.push([t, DAY_END]);
  return out;
}

export function freeNow<P extends { s: FriendStatsData | null }>(people: P[], date: string, now: number): { rows: FreeRow<P>[]; together: [number, number][] } {
  const raw = people.map((p) => {
    const list = classesFor(p.s, date);
    const slots = list
      ? list
          .map((c) => ({ name: c.name, from: c.from, to: c.to, a: mins(c.from), b: mins(c.to) }))
          .filter((c): c is Omit<Slot, "only"> & { a: number; b: number } => c.a !== null && c.b !== null && c.b > c.a)
          .sort((x, y) => x.a - y.a)
      : null;
    return { p, slots };
  });
  const known = raw.filter((r) => r.slots);
  const rows: FreeRow<P>[] = raw.map((r) => {
    if (!r.slots) return { p: r.p, slots: null, current: null, next: null, free: [] };
    const others = known.filter((k) => k !== r);
    const slots: Slot[] = r.slots.map((c) => ({
      ...c,
      only:
        others.length > 0 &&
        !others.some((o) => o.slots!.some((x) => x.a < c.b && c.a < x.b && plainName(x.name) === plainName(c.name))),
    }));
    const current = slots.find((c) => now >= c.a && now < c.b) ?? null;
    const next = slots.find((c) => c.a > now) ?? null;
    return { p: r.p, slots, current, next, free: gaps(slots.map((c) => [c.a, c.b]), now) };
  });
  const together = known.length ? gaps(known.flatMap((k) => k.slots!.map((c) => [c.a, c.b] as [number, number])), now, 30) : [];
  return { rows, together };
}

export const fmtMins = (m: number) => {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
