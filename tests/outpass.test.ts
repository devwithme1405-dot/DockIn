import { describe, expect, it } from "vitest";
import { parsePass, passSummary, needsProof, readPass, startChoices } from "@/lib/outpass";

// Thursday 19 Nov 2026, 1:05 PM
const NOW = new Date(2026, 10, 19, 13, 5);

describe("parsePass", () => {
  it("reads a same-day day outpass with a time range", () => {
    const p = parsePass("2:40pm-7pm day outpass", NOW);
    expect(p).toMatchObject({ kind: "dayout", fromDate: "2026-11-19", fromTime: "14:40", toDate: "2026-11-19", toTime: "19:00", reason: "" });
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

describe("readPass — asks instead of guessing", () => {
  it("a day out at 4 can only be 4 PM, so nothing is asked", () => {
    const r = readPass("kal 4 baje day out", NOW);
    expect(r.draft.fromTime).toBe("16:00");
    expect(r.asks).toEqual([]);
  });

  it("a day out at 10 can only be 10 AM", () => {
    expect(readPass("kal 10 baje day out", NOW).draft.fromTime).toBe("10:00");
  });

  it("6 o'clock fits both ends of a day, so it asks", () => {
    const r = readPass("kal 6 baje day out", NOW);
    expect(r.asks).toHaveLength(1);
    expect(r.asks[0].options).toEqual(["06:00", "18:00"]);
  });

  it("subah / shaam settle it", () => {
    expect(readPass("kal subah 6 baje day out", NOW).asks).toEqual([]);
    expect(readPass("kal subah 6 baje day out", NOW).draft.fromTime).toBe("06:00");
    expect(readPass("kal shaam 6 baje day out", NOW).draft.fromTime).toBe("18:00");
    expect(readPass("kal 6 baje shaam ko day out", NOW).draft.fromTime).toBe("18:00");
  });

  it("a leave time without am/pm is asked", () => {
    const r = readPass("kal 8 baje ghar jaana hai", NOW);
    expect(r.draft.kind).toBe("leave");
    expect(r.asks.map((a) => a.options)).toEqual([["08:00", "20:00"]]);
    expect(r.draft.fromTime).toBe("08:00");
  });

  it("am / pm written is never asked", () => {
    expect(readPass("kal 6pm ghar", NOW).asks).toEqual([]);
    expect(readPass("day out 3:30pm", NOW).asks).toEqual([]);
  });

  it("a day out with no time offers start times", () => {
    const r = readPass("day out", NOW);
    expect(r.needStart).toBe(true);
    expect(readPass("abhi day out", NOW).needStart).toBe(false);
    expect(startChoices("2026-11-19", NOW)[0]).toBe("13:10");
    expect(startChoices("2026-11-19", NOW).length).toBeGreaterThan(1);
  });

  it("finds the reason in plain words", () => {
    expect(readPass("kal 4 baje market jaana hai", NOW).draft.reason).toBe("Market");
    expect(readPass("day out movie dekhne", NOW).draft.reason).toBe("Movie");
    expect(readPass("day out doctor ke paas 3 baje", NOW).draft).toMatchObject({ kind: "dayout", reason: "Doctor visit" });
    const none = readPass("kal 4 baje day out", NOW);
    expect(none.reasonGiven).toBe(false);
    expect(none.draft.reason).toBe("");
  });

  it("'3 din' is a length, not the 3rd", () => {
    const r = readPass("kal se 3 din ki leave ghar", NOW);
    expect(r.draft).toMatchObject({ kind: "leave", fromDate: "2026-11-20", toDate: "2026-11-22", reason: "Going home" });
  });

  it("'3 ghante' sets when a day out ends", () => {
    expect(readPass("day out 2pm 3 ghante", NOW).draft).toMatchObject({ fromTime: "14:00", toTime: "17:00" });
  });

  it("says what it understood", () => {
    expect(readPass("kal 4 baje market", NOW).heard).toEqual(["Day Out", "Tomorrow", "4:00 pm → 7:00 pm", "Market"]);
  });
});
