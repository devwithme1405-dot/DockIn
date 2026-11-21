import { describe, it, expect, vi } from "vitest";
import { whileVisible } from "@/lib/visible";

// The node test environment has no DOM: a tiny document and window will do.
let state: DocumentVisibilityState = "visible";
const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
Object.defineProperty(doc, "visibilityState", { get: () => state });
const flip = (to: DocumentVisibilityState) => {
  state = to;
  doc.dispatchEvent(new Event("visibilitychange"));
};
describe("whileVisible", () => {
  it("stops after grace when hidden, restarts on return", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", globalThis);
    const starts: number[] = []; const stops: number[] = [];
    const end = whileVisible(() => { starts.push(1); return () => { stops.push(1); return Promise.resolve(); }; }, 1000);
    await vi.runAllTimersAsync(); expect(starts.length).toBe(1);
    flip("hidden");
    await vi.advanceTimersByTimeAsync(500);
    flip("visible"); // quick switch: no restart
    await vi.advanceTimersByTimeAsync(2000); expect(stops.length).toBe(0); expect(starts.length).toBe(1);
    flip("hidden");
    await vi.advanceTimersByTimeAsync(1500); expect(stops.length).toBe(1);
    flip("visible");
    await vi.runAllTimersAsync(); expect(starts.length).toBe(2);
    end(); expect(stops.length).toBe(2);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
