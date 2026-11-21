import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { check, getNet, goOffline, goOnline, poll, resetNet, TIMING } from "@/lib/net";

// The node test environment has no DOM: a tiny document and navigator will do.
const doc = Object.assign(new EventTarget(), { visibilityState: "visible", documentElement: { classList: { toggle: () => {} } } });

/** The server answers like this: true = 204 in time, false = no answer. */
let answer = true;

beforeEach(() => {
  vi.useFakeTimers();
  resetNet();
  answer = true;
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      answer
        ? Promise.resolve(new Response(null, { status: 204 }))
        : new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("t", "AbortError")))),
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("offline mode", () => {
  it("a working line stays online", async () => {
    await check(true);
    expect(getNet().offline).toBe(false);
  });

  it("a line too weak to answer twice goes offline", async () => {
    answer = false;
    const done = check(true);
    await vi.advanceTimersByTimeAsync(TIMING.probe * 2 + TIMING.recheck + 100);
    await done;
    expect(getNet().offline).toBe(true);
  });

  it("one bad moment is not enough", async () => {
    answer = false;
    const done = check(true);
    await vi.advanceTimersByTimeAsync(TIMING.probe + 10);
    answer = true;
    await vi.advanceTimersByTimeAsync(TIMING.recheck + 10);
    await done;
    expect(getNet().offline).toBe(false);
  });

  it("the phone saying it is offline is believed at once, without asking", async () => {
    (navigator as { onLine: boolean }).onLine = false;
    const done = check(true);
    await vi.advanceTimersByTimeAsync(TIMING.recheck + 10);
    await done;
    expect(getNet().offline).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("network back: two good answers show the popup; Go online leaves offline mode", async () => {
    goOffline();
    answer = false;
    const first = poll();
    await vi.advanceTimersByTimeAsync(TIMING.probe + 10);
    await first;
    expect(getNet()).toMatchObject({ offline: true, back: false, popup: false });

    answer = true;
    await vi.advanceTimersByTimeAsync(TIMING.poll + 10); // first good answer
    expect(getNet().back).toBe(false);
    await vi.advanceTimersByTimeAsync(2100); // second, sooner
    expect(getNet()).toMatchObject({ offline: true, back: true, popup: true });

    const heard = vi.fn();
    window.addEventListener("dockin:back-online", heard);
    goOnline();
    expect(getNet()).toMatchObject({ offline: false, back: false, popup: false });
    expect(heard).toHaveBeenCalledOnce();
  });

  it("losing the network again while the popup is up takes the popup away", async () => {
    goOffline();
    await poll();
    await vi.advanceTimersByTimeAsync(2100);
    expect(getNet().popup).toBe(true);
    answer = false;
    await vi.advanceTimersByTimeAsync(TIMING.poll + TIMING.probe + 20);
    expect(getNet()).toMatchObject({ offline: true, back: false, popup: false });
  });
});
