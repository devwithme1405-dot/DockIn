import { describe, expect, it } from "vitest";
import { isWrite, notesParts, type CamuNote } from "@/lib/v3/pass";

const note = (at: number, url: string, body = "{}", answer = "x".repeat(3000)): CamuNote => ({
  at,
  page: "/v2/leaveManagement",
  method: "POST",
  url,
  body,
  status: 200,
  answer,
});

describe("MyCamu notes", () => {
  it("tells reads, sends and analytics apart", () => {
    expect(isWrite(note(1, "/api/Leave/getAllleave/"))).toBe(false);
    expect(isWrite(note(1, "/api/get-admission-config"))).toBe(false);
    expect(isWrite(note(1, ""))).toBe(false);
    expect(isWrite(note(1, "https://www.google-analytics.com/g/collect?v=2"))).toBe(false);
    expect(isWrite(note(1, "/api/Leave/crtLv"))).toBe(true);
    expect(isWrite(note(1, "/camuattchment/getappfile"))).toBe(true);
    expect(isWrite(note(1, "https://student.bennetterp.camu.in/api/upload"))).toBe(true);
    expect(isWrite(note(1, "https://bucket.s3.ap-south-1.amazonaws.com/leave/mail.png"))).toBe(true);
  });

  it("sends every distinct submit whole, in parts that won't get cut", () => {
    const polls = Array.from({ length: 30 }, (_, i) => note(100 + i, "/api/Leave/getAllleave/"));
    const ga = Array.from({ length: 8 }, (_, i) => note(200 + i, `https://www.google-analytics.com/g/collect?${"q".repeat(900)}`));
    const big = JSON.stringify({ LvTy: "Leave", Rson: "Home", pad: "y".repeat(4000), end: "THE-END" });
    const leave1 = note(60, "/api/Leave/crtLv", JSON.stringify({ LvTy: "Leave", Rson: "Home", Attachments: ["x"] }));
    const again = { ...leave1, at: 61 };
    const leave2 = note(70, "/api/Leave/crtLv", big);
    // A day out is sent with LvTy "Leave" too — it must not hide the leaves.
    const dayout = note(50, "/api/Leave/crtLv", JSON.stringify({ LvTy: "Leave", passTy: "DOP", Rson: "Outing" }));
    const parts = notesParts({ writes: [leave1, again, leave2, dayout, ...ga], picked: polls.slice(-12), recent: polls });
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(2800);
    const all = parts.join("");
    expect(all).toContain("THE-END");
    expect(all).toContain("Outing");
    expect(all).toContain("Attachments");
    expect(all.split('\\"Home\\"').length - 1).toBe(2); // leave1 once (its repeat dropped) + leave2
    expect(all).not.toContain("google-analytics");
    expect(all).toContain("POST /api/Leave/getAllleave/ 200 ×30");
    expect(parts[0]).toContain(`part 1/${parts.length} · 3 sent`);
  });
});

import { camuHistory, verifyPass } from "@/lib/v3/pass";

// Shapes from MyCamu's own /api/Leave/getAllleave/ answer (26 Nov 2026).
const LIST = [
  { _id: "g1", lvId: "l1", passTy: "x", frdt: "2026-11-27T08:00:00.000Z", todt: "2026-11-27T19:00:00.000Z", rson: "Outing", atcmnt: [], prntAp: "SUB", stfAp: "SUB", status: "SUB", CrAt: "2026-11-26T13:40:58.980Z", isGatepass: true, passTyCode: "DOP", passTyNme: "Day Out Pass" },
  { Rson: "Outing", _id: "a1", LvTy: "Leave", start: "2026-11-27T00:00:00.000Z", end: "2026-11-27T00:00:00.000Z", Stus: "Submitted", refId: "l1" },
  { _id: "g2", lvId: "l2", frdt: "2026-11-25T18:32:00.000Z", todt: "2026-11-25T19:00:00.000Z", rson: ".", atcmnt: [], prntAp: "APPRVD", stfAp: "SUB", status: "CMPT", cOutDt: "2026-11-25T13:02:44.000Z", isCOut: true, cInDt: "2026-11-25T15:23:35.000Z", isCIn: true, passTyCode: "DOP", passTyNme: "Day Out Pass", prntName: "MAHESH", prntApAt: "2026-11-25T13:01:39.612Z" },
  { Rson: ".", _id: "a2", LvTy: "Leave", start: "2026-11-25T00:00:00.000Z", end: "2026-11-25T00:00:00.000Z", Stus: "Submitted", refId: "l2" },
  { _id: "g3", lvId: "l3", frdt: "2026-11-27T07:00:00.000Z", todt: "2026-12-10T16:00:00.000Z", rson: "Outing", atcmnt: [{ atchNm: "s.jpg", atchId: "z" }], prntAp: "SUB", status: "SUB", passTyCode: "LEAVE_OUT_PASS", passTyNme: "Leave Out Pass" },
];

describe("MyCamu's pass list", () => {
  it("each pass once, newest first, in DockIn's words", () => {
    const h = camuHistory(LIST);
    expect(h.map((p) => p.id)).toEqual(["g1", "g3", "g2"]);
    expect(h[0]).toMatchObject({ kind: "dayout", fromDate: "2026-11-27", fromTime: "08:00", toTime: "19:00", state: "applied", parent: "pending" });
    expect(h[2]).toMatchObject({ state: "back", parent: "approved", parentName: "MAHESH", outAt: "2026-11-25T13:02:44.000Z" });
    expect(h[1]).toMatchObject({ kind: "leave", toDate: "2026-12-10", toTime: "16:00", files: 1 });
  });

  it("verifies a pass field by field", () => {
    const [g1] = camuHistory(LIST);
    const ok = verifyPass({ kind: "dayout", leaveType: "Leave", fromDate: "2026-11-27", fromTime: "08:00", toDate: "2026-11-27", toTime: "19:00", reason: "Outing" }, g1);
    expect(ok.every((c) => c.ok)).toBe(true);
    const off = verifyPass({ kind: "dayout", leaveType: "Leave", fromDate: "2026-11-27", fromTime: "09:00", toDate: "2026-11-27", toTime: "19:00", reason: "Outing" }, g1);
    expect(off.filter((c) => !c.ok).map((c) => c.label)).toEqual(["Out"]);
    expect(verifyPass({ kind: "dayout", leaveType: "Leave", fromDate: "2026-11-27", fromTime: "08:00", toDate: "2026-11-27", toTime: "19:00", reason: "x" }, null).every((c) => !c.ok)).toBe(true);
  });
});
