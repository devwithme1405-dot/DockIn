import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptWeak, answered, check, dismissWeak, getNet, goOffline, poll, resetNet, TIMING } from "@/lib/net";

// The node test environment has no DOM: a tiny document and window will do.
const doc = Object.assign(new EventTarget(), { visibilityState: "visible", documentElement: { classList: { toggle: () => {} } } });

/** How the server answers: "ok" at once, "slow" after a while, "none" never. */
let answer: "ok" | "slow" | "none" | "fail" = "ok";

beforeEach(() => {
  vi.useFakeTimers();
  resetNet();
  answer = "ok";
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("t", "AbortError")));
          if (answer === "fail") reject(new TypeError("Failed to fetch")); // no network at all
          if (answer === "ok") resolve(new Response(null, { status: 204 }));
          if (answer === "slow") setTimeout(() => resolve(new Response(null, { status: 204 })), TIMING.weak + 500);
        }),
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Runs a check while time moves on, as it would on a phone. */
async function run(p: Promise<void>, ms = TIMING.probe * TIMING.misses + TIMING.recheck * (TIMING.misses - 1) + 200) {
  await vi.advanceTimersByTimeAsync(ms);
  await p;
}

describe("offline mode", () => {
  it("a working line stays online", async () => {
    await run(check(true), 50);
    expect(getNet()).toMatchObject({ offline: false, weak: false });
  });

  it("no network at all (the connection itself fails three times) goes offline by itself", async () => {
    answer = "fail";
    await run(check(true));
    expect(getNet().offline).toBe(true);
    expect(getNet().chosen).toBe(false);
  });

  it("weak campus Wi-Fi that only times out stays ONLINE…", async () => {
    answer = "none";
    await run(check(true));
    expect(getNet().offline).toBe(false);
  });

  it("…unless nothing at all comes back for two whole minutes", async () => {
    answer = "none";
    const end = Date.now() + TIMING.dead + TIMING.gap * 2;
    while (Date.now() < end && !getNet().offline) await run(check(true));
    expect(getNet().offline).toBe(true);
  });

  it("a silent line is noticed even when nobody taps anything (it keeps re-checking)", async () => {
    answer = "none";
    void check(true); // one check, then the app sits idle
    await vi.advanceTimersByTimeAsync(TIMING.dead + TIMING.gap * 3 + TIMING.probe * TIMING.misses * 2);
    expect(getNet().offline).toBe(true);
  });

  it("…but not while the app is in the background", async () => {
    answer = "none";
    void check(true);
    await vi.advanceTimersByTimeAsync(TIMING.probe * TIMING.misses + TIMING.recheck * 2 + 100);
    (doc as { visibilityState: string }).visibilityState = "hidden";
    const calls = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await vi.advanceTimersByTimeAsync(TIMING.dead * 2);
    (doc as { visibilityState: string }).visibilityState = "visible";
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls);
    expect(getNet().offline).toBe(false);
  });

  it("one bad moment is not enough to go offline", async () => {
    answer = "fail";
    const p = check(true);
    await vi.advanceTimersByTimeAsync(100); // the first try fails at once
    answer = "ok";
    await run(p, TIMING.recheck + 50);
    expect(getNet().offline).toBe(false);
  });

  it("pings fail but other requests still get answers → stays online", async () => {
    answer = "fail";
    const p = check(true);
    answered(); // Supabase answered meanwhile
    await run(p);
    expect(getNet().offline).toBe(false);
  });

  it("a miss or two, then an answer: online (just a weak moment)", async () => {
    answer = "fail";
    const p = check(true);
    await vi.advanceTimersByTimeAsync(TIMING.probe * 2 + TIMING.recheck + 10);
    answer = "ok";
    await run(p);
    expect(getNet().offline).toBe(false);
  });

  it("the phone saying it is offline is believed at once, without asking", async () => {
    (navigator as { onLine: boolean }).onLine = false;
    await run(check(true), TIMING.recheck * TIMING.misses + 50);
    expect(getNet().offline).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("network back: online again by itself, shows 'Back online', and asks the app to refresh", async () => {
    goOffline();
    const refresh = vi.fn();
    window.addEventListener("dockin:back-online", refresh);
    answer = "none";
    await run(poll(), TIMING.probe + 10);
    expect(getNet().offline).toBe(true);

    answer = "ok";
    await vi.advanceTimersByTimeAsync(TIMING.poll + 10); // one quick answer
    expect(getNet().offline).toBe(true);
    await vi.advanceTimersByTimeAsync(2100); // and another: back
    expect(getNet()).toMatchObject({ offline: false, back: true });
    expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(TIMING.backFor + 10);
    expect(getNet().back).toBe(false);

    // Just back: a wobble right after doesn't throw it straight offline again.
    answer = "fail";
    await run(check(true));
    expect(getNet().offline).toBe(false);
  });

  it("a slow line does not count as back", async () => {
    goOffline();
    answer = "slow";
    await vi.advanceTimersByTimeAsync(TIMING.poll * 6);
    expect(getNet().offline).toBe(true);
  });

  it("weak moments several times → 'low network detected multiple times'", async () => {
    answer = "slow";
    for (let i = 0; i < TIMING.weakCount; i++) {
      expect(getNet().weak).toBe(false);
      await run(check(true), TIMING.weak + 600);
    }
    expect(getNet()).toMatchObject({ weak: true, offline: false });
  });

  it("'Switch to offline' goes offline; it still comes back by itself on a clearly good line", async () => {
    answer = "slow";
    for (let i = 0; i < TIMING.weakCount; i++) await run(check(true), TIMING.weak + 600);
    acceptWeak();
    expect(getNet()).toMatchObject({ offline: true, chosen: true, weak: false });
    answer = "ok";
    await vi.advanceTimersByTimeAsync(TIMING.poll + 2100 + 10);
    expect(getNet().offline).toBe(true); // two quick answers aren't enough after it kept dropping
    await vi.advanceTimersByTimeAsync(2100);
    expect(getNet().offline).toBe(false);
  });

  it("'Stay online' hides the prompt and doesn't nag again right away", async () => {
    answer = "slow";
    for (let i = 0; i < TIMING.weakCount; i++) await run(check(true), TIMING.weak + 600);
    dismissWeak();
    expect(getNet().weak).toBe(false);
    for (let i = 0; i < TIMING.weakCount; i++) await run(check(true), TIMING.weak + 600);
    expect(getNet().weak).toBe(false);
  });
});
