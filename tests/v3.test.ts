import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { countIn, dayIn, intentOf, romanise, styleOf, subjectWords } from "@/lib/v3/demoBrain";
import { findSubject, passProblem, runTool, tidyPass } from "@/lib/v3/tools";
import { parsePass } from "@/lib/outpass";

// Thursday 26 Nov 2026, 11:00
const NOW = new Date(2026, 10, 26, 11, 0);
const TODAY = "2026-11-26";

describe("DockBot understands how a student talks", () => {
  it("answers in the student's own style", () => {
    expect(styleOf("How many classes can I skip?")).toBe("en");
    expect(styleOf("kitni classes bunk kar sakta hu")).toBe("hinglish");
    expect(styleOf("कल का टाइमटेबल")).toBe("hi");
  });

  it("knows what is being asked, in English, Hinglish and Hindi", () => {
    const cases: [string, ReturnType<typeof intentOf>][] = [
      ["kal 3 baje day outpass", "outpass"],
      ["6-10 dec leave for home", "outpass"],
      ["कल 3 बजे डे आउट पास", "outpass"],
      ["meri outpass history", "passes"],
      ["kal DBMS assignment ka reminder laga", "remind"],
      ["remind me to submit OS lab tomorrow 9pm", "remind"],
      ["kitni classes bunk kar sakta hu?", "attendance"],
      ["DBMS ki 2 class skip karu to?", "whatif"],
      ["kal ki saari classes bunk karu?", "whatif"],
      ["mera attendance kitna hai", "attendance"],
      ["अटेंडेंस बताओ", "attendance"],
      ["kal ka timetable", "timetable"],
      ["monday ki classes", "timetable"],
      ["aaj mess mein kya hai", "mess"],
      ["what's for dinner", "mess"],
      ["mere pending tasks", "tasks"],
      ["hii", "greet"],
      ["namaste", "greet"],
      ["thanks bhai", "thanks"],
      ["what is the meaning of life", "unknown"],
    ];
    for (const [text, want] of cases) expect(intentOf(text), text).toBe(want);
  });

  it("finds the day: aaj, kal, parso, weekdays (English and Hindi)", () => {
    expect(dayIn(" aaj ", TODAY)).toEqual({ date: TODAY, said: true });
    expect(dayIn(" kal ", TODAY).date).toBe("2026-11-27");
    expect(dayIn(" parso ", TODAY).date).toBe("2026-11-28");
    expect(dayIn(" monday ", TODAY).date).toBe("2026-11-30");
    expect(dayIn(" thursday ", TODAY).date).toBe(TODAY);
    expect(dayIn(` ${romanise("शुक्रवार")} `, TODAY).date).toBe("2026-11-27");
    expect(dayIn(" classes ", TODAY)).toEqual({ date: TODAY, said: false });
  });

  it("reads counts in digits and words", () => {
    expect(countIn(" 2 classes skip ")).toBe(2);
    expect(countIn(" do class chhod du ")).toBe(2);
    expect(countIn(" three lectures ")).toBe(3);
    expect(countIn(" bunk kar sakta hu ")).toBeNull();
  });

  it("keeps only the subject words", () => {
    expect(subjectWords(" kitni dbms ki classes bunk kar sakta hu ")).toBe("dbms");
    expect(subjectWords(" how many operating systems classes can i skip ")).toBe("operating systems");
  });

  it("matches a subject by code, name, short form or a word of it", () => {
    const subs = [
      { name: "Database Management Systems", code: "CSET207" },
      { name: "Operating Systems", code: "CSET209" },
      { name: "Discrete Mathematics", code: "MATH201" },
    ];
    expect(findSubject(subs, "dbms")?.code).toBe("CSET207");
    expect(findSubject(subs, "cset209")?.code).toBe("CSET209");
    expect(findSubject(subs, "operating systems")?.code).toBe("CSET209");
    expect(findSubject(subs, "maths discrete")?.code).toBe("MATH201");
    expect(findSubject(subs, "physics")).toBeNull();
  });

  it("reads a Hindi outpass through the same parser", () => {
    const p = parsePass(romanise("कल 3 बजे डे आउट पास"), NOW);
    expect(p).toMatchObject({ kind: "dayout", fromDate: "2026-11-27", fromTime: "15:00", toTime: "19:00" });
  });
});

describe("outpass rules", () => {
  it("a day out is one day, ends by 7 PM, and gets a default reason", () => {
    const p = tidyPass({ kind: "dayout", leaveType: "Leave", fromDate: TODAY, fromTime: "15:00", toDate: "2026-11-29", toTime: "21:00", reason: "." });
    expect(p).toMatchObject({ toDate: TODAY, toTime: "19:00", reason: "Personal work" });
  });

  it("says what is wrong before saving", () => {
    const base = { kind: "dayout" as const, leaveType: "Leave" as const, fromDate: TODAY, fromTime: "15:00", toDate: TODAY, toTime: "19:00", reason: "Market" };
    expect(passProblem(base, false, NOW)).toBeNull();
    expect(passProblem({ ...base, fromDate: "2026-11-25", toDate: "2026-11-25" }, false, NOW)).toMatch(/already gone/);
    expect(passProblem({ ...base, fromTime: "19:30", toTime: "19:00" }, false, NOW)).toMatch(/ends before/);
    const leave = { ...base, kind: "leave" as const, toDate: "2026-11-28" };
    expect(passProblem(leave, false, NOW)).toMatch(/screenshot/);
    expect(passProblem(leave, true, NOW)).toBeNull();
    expect(passProblem({ ...leave, leaveType: "On Duty" }, false, NOW)).toBeNull();
  });

  it("a model's proposal only ever becomes a card to confirm", async () => {
    const r = await runTool("propose_outpass", { kind: "dayout", fromDate: TODAY, fromTime: "16:00", toDate: TODAY, toTime: "22:00", reason: "Movie" });
    expect(r.card?.kind).toBe("confirm");
    if (r.card?.kind === "confirm" && r.card.action.type === "outpass") {
      expect(r.card.state).toBe("waiting");
      expect(r.card.action.draft.toTime).toBe("19:00");
    }
    const t = await runTool("propose_task", { title: "Submit OS lab", dueDate: "2026-11-27", dueTime: "21:00" });
    expect(t.card).toMatchObject({ kind: "confirm", state: "waiting", action: { type: "task", title: "Submit OS lab", dueDate: "2026-11-27", dueTime: "21:00" } });
    expect((await runTool("delete_everything", {})).data).toMatchObject({ error: expect.stringContaining("No tool") });
  });
});
