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
