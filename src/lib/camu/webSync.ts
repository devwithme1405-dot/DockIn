"use client";

/**
 * The web / iPhone twin of Android's College.java + Camu.java mapping.
 *
 * On the phone, the native plugin reads MyCamu and maps its raw JSON into the
 * `CamuState` shape every screen already draws. iPhone and the browser have no
 * plugin, so the same calls go through DockIn's server (/api/camu/*, via
 * `camuWeb`) and this file does the identical mapping in TypeScript — field for
 * field with the Java — so Today, Attendance, Timetable and Cafeteria fill from
 * MyCamu on the web exactly as they do in the app.
 *
 * Attendance is the backbone: if it fails the sync fails. Timetable, the mess
 * menu and the per-class history are extras — a bad moment for any of them keeps
 * the last copy and never fails the whole sync, matching College.java.
 */

import { addDays, toDateStr } from "../dates";
import type { CamuCafeteria, CamuClass, CamuHoliday, CamuMeal, CamuPeriod, CamuState, CamuSubject } from "../native";
import { camuWeb, CamuWebError } from "./web";

type Dict = Record<string, unknown>;

const asArr = (v: unknown): Dict[] => (Array.isArray(v) ? (v as Dict[]) : []);
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const str = (v: unknown, d = ""): string => (v == null ? d : String(v));

// --------------------------------------------------------------- attendance

/** Overall attendance (College.java syncCamu). */
export function mapOverall(att: Dict): { pct: number; present: number; total: number } {
  return { pct: num(att.OvrAllPrcntg), present: num(att.OvrAllPCnt), total: num(att.OvrAllCnt) };
}

/** Per-subject counts (College.java subjects()). */
export function mapSubjects(att: Dict): CamuSubject[] {
  const list = Array.isArray(att.aSubjectList) ? att.aSubjectList : att.subjectList;
  return asArr(list).map((s) => ({
    id: str(s.SubjId),
    code: str(s.SubjCd),
    name: str(s.SubjNm),
    present: num(s.pnt, num(s.prsentCnt)),
    total: num(s.all),
    absent: num(s.absentCnt),
    leave: num(s.leaveCnt) + num(s.medLeaveCnt),
    duty: num(s.onDutyCnt),
    pct: num(s.p, num(s.prsPercnt)),
  }));
}

// ---------------------------------------------------------------- timetable

/**
 * MyCamu answers the timetable as [periods, ?, holidays, semester]; only the
 * first and third matter, and the first is sometimes an object with Periods /
 * Holiday instead of a bare array (Camu.java timetable()).
 */
export function extractTimetable(raw: unknown): { periods: Dict[]; holidays: Dict[] } {
  let periods: Dict[] = [];
  let holidays: Dict[] = [];
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (Array.isArray(first)) periods = first as Dict[];
    else if (first && typeof first === "object") {
      const p = (first as Dict).Periods;
      if (Array.isArray(p)) periods = p as Dict[];
      const h = (first as Dict).Holiday;
      if (Array.isArray(h)) holidays = h as Dict[];
    }
    const third = raw[2];
    if (Array.isArray(third)) holidays = third as Dict[];
  }
  return { periods, holidays };
}

/** One scheduled class (College.java periods()). */
export function mapPeriods(raw: Dict[]): CamuPeriod[] {
  const out: CamuPeriod[] = [];
  for (const p of raw) {
    const start = str(p.start);
    const end = str(p.end);
    if (start.length < 16) continue;
    out.push({
      date: start.slice(0, 10),
      from: str(p.FrTime) || start.slice(11, 16),
      to: str(p.ToTime) || (end.length >= 16 ? end.slice(11, 16) : ""),
      name: str(p.SubNa) || str(p.title),
      code: str(p.SubCd),
      subId: str(p.SubID),
      room: str(p.Location) || str(p.LocNm),
      teacher: str(p.StaffNm),
      kind: str(p.subTyp),
      status: str(p.StF1),
    });
  }
  return out;
}

/** Holidays (College.java holidays()); Camu's `end` is the day after the last. */
export function mapHolidays(raw: Dict[]): CamuHoliday[] {
  const out: CamuHoliday[] = [];
  for (const h of raw) {
    const start = str(h.start);
    const end = str(h.end) || start;
    if (start.length < 10) continue;
    out.push({
      title: str(h.title) || "Holiday",
      start: start.slice(0, 10),
      end: end.length >= 10 ? end.slice(0, 10) : start.slice(0, 10),
    });
  }
  return out;
}

// ----------------------------------------------------------------- cafeteria

/** Today's mess menu + the reusable QR (Camu.java cafeteria()). */
export function mapCafeteria(menu: Dict | null, qr: Dict | null): CamuCafeteria {
  const out: CamuCafeteria = {};
  if (menu) {
    out.facility = str(menu.facNme);
    out.date = str(menu.curntDte);
    const meals: CamuMeal[] = [];
    for (const m of asArr(menu.oMealList)) {
      const code = str(m.msCde);
      const paren = code.indexOf("(");
      const meal = paren > 0 ? code.slice(0, paren).trim() : code;
      meals.push({ meal, label: str(m.mealTm) || meal, items: str(m.msNme), color: str(m.mealClr) });
    }
    out.meals = meals;
  }
  if (qr) out.qr = str(qr.prQrCd);
  return out;
}

// ------------------------------------------------------------------ history

/** One subject's class-by-class record (College.java classes()). */
export function mapClasses(raw: unknown): CamuClass[] {
  const out: CamuClass[] = [];
  for (const a of asArr(raw)) {
    const date = str(a.ForDate);
    if (date.length < 10) continue;
    out.push({
      date: date.slice(0, 10),
      from: str(a.FrTime),
      to: str(a.ToTime),
      present: !!a.present,
      leave: str(a.LvTy) || str(a.LeaveSt),
    });
  }
  return out;
}

// ------------------------------------------------------------------- orchestrate

const day = (offset: number): string => addDays(toDateStr(), offset);

/** Is MyCamu linked for this signed-in user on the server? */
export async function isWebLinked(): Promise<boolean> {
  try {
    return !!(await camuWeb.status()).linked;
  } catch {
    return false;
  }
}

/**
 * One web sync of everything-college, mapped into `CamuState`. `history` adds
 * the per-subject class list (an extra round-trip per subject), so it's done on
 * a full sync / first connect, not on every quiet refresh.
 *
 * Throws only when attendance itself can't be read for a real reason (network);
 * an expired session comes back as a normal state with `expired: true`, and a
 * missing link as `connected: false`, so the caller can show the right screen.
 */
export async function fetchWebCamu(opts: { history: boolean }): Promise<CamuState> {
  const now = Date.now();

  let att: Dict;
  try {
    att = (await camuWeb.attendance()) as Dict;
  } catch (e) {
    if (e instanceof CamuWebError) {
      if (e.kind === "expired") return { connected: true, expired: true, error: "MyCamu signed you out. Reconnect to keep attendance updating." };
      if (e.needsLink || e.kind === "auth") return { connected: false };
    }
    throw e;
  }

  const subjects = mapSubjects(att);
  const camu: CamuState = { connected: true, expired: false, syncedAt: now, overall: mapOverall(att), subjects };

  // Timetable — an extra: a bad moment keeps the last copy.
  try {
    const raw = await camuWeb.timetable(day(-7), day(14));
    const { periods, holidays } = extractTimetable(raw);
    camu.periods = mapPeriods(periods);
    camu.holidays = mapHolidays(holidays);
  } catch {
    /* keep the last timetable */
  }

  // Cafeteria — an extra of the same kind.
  try {
    const { menu, qr } = await camuWeb.mess();
    camu.cafeteria = mapCafeteria((menu ?? null) as Dict | null, (qr ?? null) as Dict | null);
  } catch {
    /* keep the last menu and pass */
  }

  // Per-class history — the heaviest extra, only on a full sync / first connect.
  if (opts.history) {
    const ids = subjects.map((s) => s.id).filter(Boolean);
    if (ids.length) {
      try {
        const pairs = await Promise.all(
          ids.map(async (id) => {
            try {
              return [id, mapClasses(await camuWeb.history(id))] as const;
            } catch {
              return [id, [] as CamuClass[]] as const;
            }
          }),
        );
        const history: Record<string, CamuClass[]> = {};
        for (const [id, classes] of pairs) history[id] = classes;
        camu.history = history;
        camu.historyAt = now;
      } catch {
        /* keep the old history */
      }
    }
  }

  return camu;
}
