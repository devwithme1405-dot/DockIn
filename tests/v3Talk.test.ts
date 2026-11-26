import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";

// A student's Camu, as the phone would have it.
const TODAY = "2026-11-26";
vi.mock("@/lib/college", async (orig) => {
  const real = await orig<typeof import("@/lib/college")>();
  const camu = {
    connected: true,
    overall: { pct: 82, present: 82, total: 100 },
    subjects: [
      { id: "a", code: "CSET207", name: "Database Management Systems", present: 20, total: 24, absent: 4, leave: 0, duty: 0, pct: 83.3 },
      { id: "b", code: "CSET209", name: "Operating Systems", present: 14, total: 20, absent: 6, leave: 0, duty: 0, pct: 70 },
    ],
    periods: [
      { date: "2026-11-27", from: "09:25", to: "10:20", name: "Operating Systems", code: "CSET209", subId: "b", room: "N-204", teacher: "", kind: "Lecture", status: "" },
      { date: "2026-11-27", from: "10:25", to: "11:20", name: "Database Management Systems", code: "CSET207", subId: "a", room: "N-108", teacher: "", kind: "Lecture", status: "" },
    ],
    holidays: [],
    cafeteria: { date: `${TODAY}T00:00:00`, meals: [{ meal: "Lunch", label: "Lunch 12:30 PM - 2:30 PM", items: "Rajma\nRice\nRoti" }] },
  };
  return { ...real, collegeNow: () => ({ camu }) };
});
vi.mock("@/lib/repo", async (orig) => {
  const real = await orig<typeof import("@/lib/repo")>();
  return { ...real, getProfile: async () => ({ name: "Sachin Kumar", target: 75 }) };
});

const { demoReply } = await import("@/lib/v3/demoBrain");
const NOW = new Date(2026, 10, 26, 11, 0);

beforeAll(() => vi.useFakeTimers({ now: NOW, toFake: ["Date"] }));

describe("a demo conversation over real-looking Camu data", () => {
  it("overall attendance and what can be skipped, in Hinglish", async () => {
    const r = await demoReply("kitni classes bunk kar sakta hu?", "Sachin Kumar", NOW);
    expect(r.text).toContain("82.0%");
    expect(r.text).toMatch(/9 classes aur bunk/);
    expect(r.cards[0]?.kind).toBe("attendance");
  });

  it("one subject below target says how many to attend, in English", async () => {
    const r = await demoReply("how much is my OS attendance", "Sachin Kumar", NOW);
    expect(r.text).toMatch(/^Operating Systems: 70\.0%/);
    expect(r.text).toMatch(/next 4 classes/);
  });

  it("skipping all of tomorrow's classes", async () => {
    const r = await demoReply("kal ki saari classes bunk karu?", "Sachin Kumar", NOW);
    expect(r.text).toMatch(/saari 2 classes/);
    expect(r.cards[0]).toMatchObject({ kind: "whatif", skip: 2 });
  });

  it("tomorrow's timetable, in Hindi", async () => {
    const r = await demoReply("कल का टाइमटेबल", "Sachin Kumar", NOW);
    expect(r.text).toMatch(/2 क्लास/);
    expect(r.cards[0]).toMatchObject({ kind: "classes", date: "2026-11-27" });
  });

  it("the mess menu", async () => {
    const r = await demoReply("aaj mess mein kya hai", "Sachin Kumar", NOW);
    expect(r.cards[0]).toMatchObject({ kind: "mess" });
  });

  it("a reminder is proposed, not added", async () => {
    const r = await demoReply("kal raat 9 baje DBMS assignment ka reminder laga do", "Sachin Kumar", NOW);
    expect(r.cards[0]).toMatchObject({ kind: "confirm", state: "waiting", action: { type: "task", dueDate: "2026-11-27", dueTime: "21:00" } });
    const a = r.cards[0].kind === "confirm" ? r.cards[0].action : null;
    expect(a?.type === "task" && a.title).toBe("DBMS assignment");
  });

  it("a day out pass is proposed for tomorrow 3 PM to 7 PM", async () => {
    const r = await demoReply("kal 3 baje day outpass bana do", "Sachin Kumar", NOW);
    expect(r.cards[0]).toMatchObject({
      kind: "confirm",
      action: { type: "outpass", draft: { kind: "dayout", fromDate: "2026-11-27", fromTime: "15:00", toTime: "19:00" } },
    });
  });

  it("a leave asks for the mail screenshot", async () => {
    const r = await demoReply("6 to 10 dec leave for home", "Sachin Kumar", NOW);
    expect(r.text).toMatch(/screenshot/);
    expect(r.cards[0]).toMatchObject({ kind: "confirm", action: { type: "outpass", draft: { kind: "leave", fromDate: "2026-12-06", toDate: "2026-12-10" } } });
  });

  it("something it can't do is said honestly, with ideas", async () => {
    const r = await demoReply("tell me a joke", "Sachin Kumar", NOW);
    expect(r.cards[0]?.kind).toBe("suggest");
  });
});
