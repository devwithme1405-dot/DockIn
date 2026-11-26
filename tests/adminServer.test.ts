import { describe, expect, it } from "vitest";
import { olderThan, versionParts } from "@/lib/adminServer";

describe("app versions for 'Old app' notifications", () => {
  it("reads build numbers", () => {
    expect(versionParts("2.0.57")).toEqual([2, 0, 57]);
    expect(versionParts("3.0-preview.4")).toEqual([3, 0, 0, 4]);
  });
  it("compares by number, not text", () => {
    expect(olderThan("2.0.97", "2.0.120")).toBe(true);
    expect(olderThan("2.0.120", "2.0.120")).toBe(false);
    expect(olderThan("2.0.131", "2.0.120")).toBe(false);
    expect(olderThan("web", "2.0.120")).toBe(false);
    expect(olderThan(null, "2.0.120")).toBe(false);
  });
});
