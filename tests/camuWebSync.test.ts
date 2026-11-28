import { describe, expect, it } from "vitest";
import {
  extractTimetable,
  mapCafeteria,
  mapClasses,
  mapHolidays,
  mapOverall,
  mapPeriods,
  mapSubjects,
} from "@/lib/camu/webSync";

/**
 * These mirror, field for field, the Android mapping in College.java / Camu.java.
 * The web screens read MyCamu through DockIn's server and must come out identical,
 * so a drift here would mean iPhone shows different numbers than the app.
 */

describe("attendance mapping", () => {
  const att = {
    OvrAllPrcntg: 82.5,
    OvrAllPCnt: 33,
    OvrAllCnt: 40,
    aSubjectList: [
      { SubjId: "s1", SubjCd: "2025CSET200", SubjNm: "DBMS ( P )", pnt: 18, all: 20, absentCnt: 2, leaveCnt: 1, medLeaveCnt: 1, onDutyCnt: 0, p: 90 },
    ],
  };

  it("maps overall", () => {
    expect(mapOverall(att)).toEqual({ pct: 82.5, present: 33, total: 40 });
  });

  it("maps a subject with leave = leaveCnt + medLeaveCnt", () => {
    expect(mapSubjects(att)).toEqual([
      { id: "s1", code: "2025CSET200", name: "DBMS ( P )", present: 18, total: 20, absent: 2, leave: 2, duty: 0, pct: 90 },
    ]);
  });

  it("falls back to subjectList + prsentCnt/prsPercnt when the primary fields are absent", () => {
    const raw = { subjectList: [{ SubjId: "s2", SubjCd: "X", SubjNm: "Y", prsentCnt: 5, all: 10, prsPercnt: 50 }] };
    const [s] = mapSubjects(raw);
    expect(s.present).toBe(5);
    expect(s.total).toBe(10);
    expect(s.pct).toBe(50);
  });

  it("is empty, not thrown, when there are no subjects", () => {
    expect(mapSubjects({})).toEqual([]);
  });
});

describe("timetable mapping", () => {
  const period = { start: "2026-11-20T09:00:00", end: "2026-11-20T10:00:00", FrTime: "09:00", ToTime: "10:00", SubNa: "DBMS", SubCd: "CSET200", SubID: "s1", Location: "A-101", StaffNm: "Dr X", subTyp: "Theory", StF1: "A" };
  const holiday = { title: "Diwali", start: "2026-11-01", end: "2026-11-03" };

  it("extracts periods/holidays from the [periods, ?, holidays] array form", () => {
    const { periods, holidays } = extractTimetable([[period], null, [holiday]]);
    expect(periods).toHaveLength(1);
    expect(holidays).toHaveLength(1);
  });

  it("extracts from the object-with-Periods/Holiday form", () => {
    const { periods, holidays } = extractTimetable([{ Periods: [period], Holiday: [holiday] }]);
    expect(periods).toHaveLength(1);
    expect(holidays).toHaveLength(1);
  });

  it("maps a period's fields and date/time slices", () => {
    expect(mapPeriods([period])).toEqual([
      { date: "2026-11-20", from: "09:00", to: "10:00", name: "DBMS", code: "CSET200", subId: "s1", room: "A-101", teacher: "Dr X", kind: "Theory", status: "A" },
    ]);
  });

  it("falls back to the datetime for from/to and title for name", () => {
    const [p] = mapPeriods([{ start: "2026-11-20T11:30:00", end: "2026-11-20T12:30:00", title: "Lab" }]);
    expect(p.from).toBe("11:30");
    expect(p.to).toBe("12:30");
    expect(p.name).toBe("Lab");
  });

  it("drops a period with no usable start", () => {
    expect(mapPeriods([{ start: "bad" }])).toEqual([]);
  });

  it("maps holidays, keeping Camu's exclusive end", () => {
    expect(mapHolidays([holiday])).toEqual([{ title: "Diwali", start: "2026-11-01", end: "2026-11-03" }]);
  });
});

describe("cafeteria mapping", () => {
  it("maps the menu, meal name before '(', and the QR", () => {
    const menu = { facNme: "North Mess", curntDte: "2026-11-20", oMealList: [{ msCde: "Breakfast (B)", mealTm: "07:30 AM - 09:30 AM", msNme: "Idli\nSambar", mealClr: "#f0872b" }] };
    const qr = { prQrCd: "QR-PAYLOAD-123" };
    expect(mapCafeteria(menu, qr)).toEqual({
      facility: "North Mess",
      date: "2026-11-20",
      meals: [{ meal: "Breakfast", label: "07:30 AM - 09:30 AM", items: "Idli\nSambar", color: "#f0872b" }],
      qr: "QR-PAYLOAD-123",
    });
  });

  it("keeps the menu even when the QR is missing", () => {
    const out = mapCafeteria({ facNme: "M", curntDte: "d", oMealList: [] }, null);
    expect(out.facility).toBe("M");
    expect(out.qr).toBeUndefined();
  });
});

describe("history mapping", () => {
  it("maps a class and keeps only dated rows", () => {
    const raw = [
      { ForDate: "2026-11-20T00:00:00", FrTime: "09:00", ToTime: "10:00", present: true, LvTy: "" },
      { ForDate: "", present: false },
    ];
    expect(mapClasses(raw)).toEqual([{ date: "2026-11-20", from: "09:00", to: "10:00", present: true, leave: "" }]);
  });
});
