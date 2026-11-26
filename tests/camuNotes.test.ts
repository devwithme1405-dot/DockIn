import { describe, expect, it } from "vitest";
import { isWrite, notesReport, type CamuNote } from "@/lib/v3/pass";

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
  it("tells reads from sends", () => {
    expect(isWrite(note(1, "/api/Leave/getAllleave/"))).toBe(false);
    expect(isWrite(note(1, "/api/get-admission-config"))).toBe(false);
    expect(isWrite(note(1, ""))).toBe(false);
    expect(isWrite(note(1, "/api/Leave/applyLeave"))).toBe(true);
    expect(isWrite(note(1, "/api/upload/file"))).toBe(true);
  });

  it("puts the submit first and whole, and fits a message even with lots of polling", () => {
    const polls = Array.from({ length: 30 }, (_, i) => note(100 + i, "/api/Leave/getAllleave/"));
    const submit = note(50, "/api/Leave/applyLeave", JSON.stringify({ passTy: "668d3c5249658beda46bb05a", rson: "Outing", pad: "y".repeat(1200) }));
    const r = notesReport({ writes: [submit], picked: polls.slice(-12), recent: polls });
    expect(r.length).toBeLessThanOrEqual(3800);
    expect(r).toContain("SENT (1)");
    expect(r).toContain("/api/Leave/applyLeave");
    expect(r).toContain("668d3c5249658beda46bb05a");
    expect(r).toContain("POST /api/Leave/getAllleave/ 200 ×30");
  });
});
