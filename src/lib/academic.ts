/**
 * Bennett University's academic calendar (AY 2026–27), the named holidays taken
 * from the university's own PDF. Saturdays and Sundays are holidays too, but
 * those are worked out from the date rather than listed here.
 *
 * A class on a holiday does not count against attendance, so these dates are
 * what the calendar highlights and what "next holiday" counts down to.
 */

export interface Holiday {
  /** "YYYY-MM-DD". */
  date: string;
  name: string;
}

/** The festival and gazetted holidays, in order. Weekends are added separately. */
export const ACADEMIC_HOLIDAYS: Holiday[] = [
  { date: "2026-08-15", name: "Independence Day" },
  { date: "2026-08-26", name: "Id-e-Milad" },
  { date: "2026-09-04", name: "Krishna Janmashtami" },
  { date: "2026-10-02", name: "Mahatma Gandhi Jayanti" },
  { date: "2026-10-20", name: "Dussehra / Vijayadashami" },
  { date: "2026-11-06", name: "Dhanteras" },
  { date: "2026-11-08", name: "Diwali / Deepavali" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-01-26", name: "Republic Day" },
  { date: "2027-02-28", name: "National Science Day" },
  { date: "2027-03-06", name: "Maha Shivratri" },
  { date: "2027-03-10", name: "Eid ul Fitr / Ramadan Id" },
  { date: "2027-03-22", name: "Holi" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-04-14", name: "Dr. Ambedkar Jayanti" },
  { date: "2027-04-19", name: "Mahavir Jayanti" },
  { date: "2027-05-17", name: "Bakrid / Eid al Adha" },
  { date: "2027-05-20", name: "Buddha Purnima" },
];

/**
 * The last day classes are actually held in the odd semester (Sem 3, 2026–27).
 * After this, end-term exams begin and nothing new is taught, so projecting a
 * trip's cost past it would count classes that never happen. This is an assumed
 * date — adjust it to the one on the university's academic calendar.
 */
export const LAST_TEACHING_DAY = "2026-12-11";

const BY_DATE = new Map(ACADEMIC_HOLIDAYS.map((h) => [h.date, h]));

/** The day of week, 0 = Sunday … 6 = Saturday, read from the date string alone. */
export function weekdayOfDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** A weekend is a holiday — the college is closed Saturday and Sunday. */
export function isWeekend(date: string): boolean {
  const w = weekdayOfDate(date);
  return w === 0 || w === 6;
}

export type HolidayKind = "festival" | "weekend";

/** What kind of holiday a date is, or null when it is a working day. */
export function holidayInfo(date: string): { name: string; kind: HolidayKind } | null {
  const named = BY_DATE.get(date);
  if (named) return { name: named.name, kind: "festival" };
  if (isWeekend(date)) return { name: weekdayOfDate(date) === 0 ? "Sunday" : "Saturday", kind: "weekend" };
  return null;
}

/** Add days to a "YYYY-MM-DD" and get the string back. */
function add(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Every holiday (weekends and festivals) from `from` up to and including `to`. */
export function holidaysBetween(from: string, to: string): { date: string; name: string; kind: HolidayKind }[] {
  const out: { date: string; name: string; kind: HolidayKind }[] = [];
  if (from > to) return out;
  for (let d = from, i = 0; d <= to && i < 400; d = add(d, 1), i++) {
    const info = holidayInfo(d);
    if (info) out.push({ date: d, ...info });
  }
  return out;
}

/** The next named (festival) holiday on or after a date — weekends are skipped. */
export function nextFestival(from: string): Holiday | null {
  return ACADEMIC_HOLIDAYS.find((h) => h.date >= from) ?? null;
}

/** The next holiday of any kind strictly after a date (so "next" is never today). */
export function nextHolidayAfter(from: string): { date: string; name: string; kind: HolidayKind } | null {
  for (let d = add(from, 1), i = 0; i < 400; d = add(d, 1), i++) {
    const info = holidayInfo(d);
    if (info) return { date: d, ...info };
  }
  return null;
}
