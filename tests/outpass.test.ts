import { describe, expect, it } from "vitest";
import { parsePass, passSummary, needsProof } from "@/lib/outpass";

// Thursday 19 Nov 2026, 1:05 PM
const NOW = new Date(2026, 10, 19, 13, 5);

describe("parsePass", () => {
  it("reads a same-day day outpass with a time range", () => {
    const p = parsePass("2:40pm-7pm day outpass", NOW);
    expect(p).toMatchObject({ kind: "dayout", fromDate: "2026-11-19", fromTime: "14:40", toDate: "2026-11-19", toTime: "19:00", reason: "." });
  });

  it("shares pm across a range and caps a day out at 7 PM", () => {
    const p = parsePass("day out 3-9pm", NOW);
    expect(p.fromTime).toBe("15:00");
    expect(p.toTime).toBe("19:00");
  });

  it("understands kal and baje", () => {
    const p = parsePass("kal 4 baje day out", NOW);
    expect(p).toMatchObject({ kind: "dayout", fromDate: "2026-11-20", fromTime: "16:00", toTime: "19:00" });
  });

  it("a bare day range is a leave, rolling into next month when the day has gone", () => {
    const p = parsePass("6-10 leave", NOW);
    expect(p).toMatchObject({ kind: "leave", leaveType: "Leave", fromDate: "2026-12-06", toDate: "2026-12-10" });
    expect(needsProof(p)).toBe(true);
  });

  it("keeps this month for days still ahead", () => {
    const p = parsePass("leave 25 to 28", NOW);
    expect(p).toMatchObject({ fromDate: "2026-11-25", toDate: "2026-11-28" });
  });

  it("reads month names, medical, and a reason", () => {
    const p = parsePass("medical leave 6 dec to 9 dec for fever checkup", NOW);
    expect(p).toMatchObject({ kind: "leave", leaveType: "Medical", fromDate: "2026-12-06", toDate: "2026-12-09", reason: "Fever checkup" });
  });

  it("wraps a range across the month end", () => {
    const p = parsePass("ghar jaana 28-2", NOW);
    expect(p).toMatchObject({ kind: "leave", fromDate: "2026-11-28", toDate: "2026-12-02" });
  });

  it("on duty skips the proof", () => {
    const p = parsePass("on duty 22-23 hackathon", NOW);
    expect(p.leaveType).toBe("On Duty");
    expect(needsProof(p)).toBe(false);
  });

  it("summarises for the Camu bar", () => {
    expect(passSummary(parsePass("2:40pm-7pm day outpass", NOW))).toContain("Day Out Pass");
  });
});
