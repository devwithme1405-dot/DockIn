import { describe, expect, it } from "vitest";
import { plan, readClaim } from "@/lib/identityServer";

const ME = "me";
const OTHER = "other";

describe("enrollment usernames — the rules", () => {
  it("reads only real enrollments and MyCamu ids", () => {
    expect(readClaim({ enrollment: "s25cseu0155", stuId: "6899A3E84245C98C34C20825", name: "Sachin" })).toEqual({
      enrollment: "S25CSEU0155",
      stuId: "6899a3e84245c98c34c20825",
      name: "Sachin",
    });
    expect(readClaim({ enrollment: "hello123", stuId: "6899a3e84245c98c34c20825" })).toBeNull();
    expect(readClaim({ enrollment: "S25CSEU0155", stuId: "x" })).toBeNull();
  });

  it("first time: the name is free → take it", () => {
    expect(plan({ byStu: null, byEnr: null, nameHolder: null }, ME, false)).toEqual({ do: "take", renameHolder: null });
  });

  it("someone else sits on my enrollment without proof → they lose it when I confirm", () => {
    expect(plan({ byStu: null, byEnr: null, nameHolder: OTHER }, ME, false)).toEqual({ do: "take", renameHolder: OTHER });
  });

  it("at sign-up, an unconfirmed account with my enrollment may be my own: ask first", () => {
    expect(plan({ byStu: null, byEnr: null, nameHolder: OTHER }, null, true)).toEqual({ do: "refuse", code: "exists_unverified" });
  });

  it("one MyCamu ↔ one DockIn account", () => {
    expect(plan({ byStu: OTHER, byEnr: { user: OTHER, stuId: "a" }, nameHolder: OTHER }, ME, false)).toEqual({ do: "refuse", code: "already_linked" });
    expect(plan({ byStu: OTHER, byEnr: null, nameHolder: null }, null, true)).toEqual({ do: "refuse", code: "already_linked" });
  });

  it("an enrollment confirmed by a different MyCamu student is a dispute", () => {
    expect(plan({ byStu: null, byEnr: { user: OTHER, stuId: "b" }, nameHolder: OTHER }, ME, false)).toEqual({ do: "refuse", code: "conflict" });
  });

  it("already confirmed as me → nothing to do", () => {
    expect(plan({ byStu: ME, byEnr: { user: ME, stuId: "a" }, nameHolder: ME }, ME, false)).toEqual({ do: "done" });
  });
});
