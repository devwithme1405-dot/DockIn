/**
 * Offline mode, end to end in a real browser: the whole app is saved for
 * offline, no internet shows the Offline mode strip (never a "No internet /
 * Try again" wall), every tab and the mess pass work, it goes back online by
 * itself, a dead line counts as offline, and a line that keeps being weak gets
 * the "Low network detected multiple times" prompt.
 *
 *   node scripts/offline-check.mjs        # against a production build on :3000
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = "/tmp/dockin-shots";
mkdirSync(SHOTS, { recursive: true });

const today = new Date();
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** Written straight into IndexedDB, the way the app would have written it. */
const SEED = {
  profile: [
    {
      id: "me",
      name: "Sachin",
      target: 75,
      theme: "system",
      onboarded: true,
      budget: 6000,
      branch: "BTech CSE",
      year: 2,
      section: "E1",
      messQr: "BENNETT-MESS-PASS-E23CSEU0155",
      roll: "E23CSEU0155",
      createdAt: Date.now() - 86400000 * 40,
      updatedAt: Date.now(),
    },
  ],
  subjects: [
    { id: "s1", name: "Data Structures", code: "CSET201", color: "#1f5fd6" },
    { id: "s2", name: "Full Stack Development", code: "CSET207", color: "#C2185B" },
    { id: "s3", name: "Operating Systems", code: "CSET209", color: "#2E7D32" },
  ].map((s) => ({ ...s, createdAt: 0, updatedAt: 0, deletedAt: null })),
  slots: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) =>
    [
      { n: 1, subjectId: "s1", start: "08:20", end: "09:20" },
      { n: 2, subjectId: "s2", start: "09:25", end: "10:25" },
      { n: 3, subjectId: "s3", start: "10:30", end: "11:30" },
    ].map((p) => ({
      id: `sl-${weekday}-${p.n}`,
      subjectId: p.subjectId,
      weekday,
      start: p.start,
      end: p.end,
      kind: "lecture",
      room: "N-204",
      weight: 1,
      from: null,
      until: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })),
  ),
  expenses: [
    { id: "e1", amount: 60, category: "kathi-247", note: "", date: plus(0) },
    { id: "e2", amount: 60, category: "kathi-247", note: "", date: plus(-2) },
    { id: "e3", amount: 20, category: "tuck-shop", note: "", date: plus(-1) },
    { id: "e4", amount: 20, category: "tuck-shop", note: "", date: plus(-3) },
    { id: "e5", amount: 450, category: "dominos", note: "Treat", date: plus(-5) },
    { id: "e6", amount: 120, category: "cab", note: "", date: plus(-35) },
  ].map((e) => ({ ...e, createdAt: 0, updatedAt: 0, deletedAt: null })),
  tasks: [
    {
      id: "t1",
      title: "DSA assignment 4",
      notes: "",
      kind: "assignment",
      subjectId: "s1",
      dueDate: plus(1),
      dueTime: null,
      room: "",
      priority: "high",
      done: false,
      doneAt: null,
      subtasks: [],
    },
    {
      id: "t2",
      title: "OS mid-sem",
      notes: "",
      kind: "exam",
      subjectId: "s3",
      dueDate: plus(9),
      dueTime: "10:00",
      room: "G-12",
      priority: "med",
      done: false,
      doneAt: null,
      subtasks: [
        { id: "x", text: "Paging", done: true },
        { id: "y", text: "Scheduling", done: false },
      ],
    },
    {
      id: "t3",
      title: "Pay hostel mess bill",
      notes: "",
      kind: "personal",
      subjectId: null,
      dueDate: plus(-2),
      dueTime: null,
      room: "",
      priority: "med",
      done: false,
      doneAt: null,
      subtasks: [],
    },
    {
      id: "t4",
      title: "FSD lab record",
      notes: "",
      kind: "assignment",
      subjectId: "s2",
      dueDate: plus(-6),
      dueTime: null,
      room: "",
      priority: "low",
      done: true,
      doneAt: Date.now() - 86400000,
      subtasks: [],
    },
  ].map((t) => ({ ...t, createdAt: 0, updatedAt: 0, deletedAt: null })),
  events: [
    {
      id: "h1",
      title: "Diwali break",
      kind: "holiday",
      date: plus(2),
      endDate: plus(6),
      note: "",
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
  ],
};

async function seed(page) {
  await page.evaluate(async (data) => {
    // Let the app create the schema, then fill the stores it made.
    await new Promise((resolve) => {
      const req = indexedDB.open("dockin");
      req.onsuccess = () => {
        const db = req.result;
        const names = [...db.objectStoreNames].filter((n) => data[n]);
        const tx = db.transaction(names, "readwrite");
        for (const name of names) for (const row of data[name]) tx.objectStore(name).put(row);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      };
      req.onerror = () => resolve();
    });
  }, SEED);
}


const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36" });
const page = await ctx.newPage();
const bad = [];
page.on("pageerror", (e) => bad.push("uncaught " + e.message));
let ok = 0; const fail = [];
const step = async (name, fn) => { try { await fn(); ok++; console.log("ok  ", name); } catch (e) { fail.push(name); console.log("FAIL", name, "—", e.message.split("\n")[0]); } };
const text = async () => (await page.locator("body").innerText());
const noWall = async () => { const t = await text(); for (const w of ["hit a snag", "Try again", "Can't reach", "No internet"]) if (t.includes(w)) throw new Error("saw: " + w); };

await page.goto(BASE + "/onboarding", { waitUntil: "networkidle" });
for (let i = 0; i < 5; i++) { await page.waitForTimeout(700); try { await seed(page); break; } catch {} }
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 60000 });

await step("whole app saved for offline (every file of the build)", async () => {
  const want = await (await fetch(BASE + "/_next/static/dockin-precache.json")).json();
  for (let i = 0; i < 40; i++) {
    const have = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await c.keys()).map((r) => new URL(r.url).pathname); });
    const missing = want.filter((w) => !have.includes(w));
    if (!missing.length) return;
    if (i === 39) throw new Error(missing.length + " missing, e.g. " + missing[0]);
    await page.waitForTimeout(500);
  }
});
await step("online: no offline strip", async () => { if (await page.locator(".offline-strip").count()) throw new Error("strip shown online"); });

await ctx.setOffline(true);
await page.reload({ waitUntil: "load" });
await step("no internet: Offline mode strip at the top, fast", async () => {
  await page.locator(".offline-strip", { hasText: "Offline mode" }).waitFor({ timeout: 4000 });
  const box = await page.locator(".offline-pill").boundingBox();
  if (!box || box.y > 20) throw new Error("pill not at the top: " + JSON.stringify(box));
});
await page.waitForTimeout(600);
await page.screenshot({ path: SHOTS + "/1-today-offline.png" });
await step("Today: offline card with a Mess pass button, no error walls", async () => {
  await page.getByText("You’re offline").waitFor({ timeout: 3000 });
  await noWall();
});
await step("header leaves room for the strip (nothing hidden under it)", async () => {
  const strip = await page.locator(".offline-strip").boundingBox();
  const h = await page.getByText("Good Afternoon", { exact: false }).or(page.getByText("Good ", { exact: false })).first().boundingBox();
  if (h && h.y < strip.y + strip.height) throw new Error("greeting under the strip");
});
await step("Mess pass button opens Cafeteria at the QR", async () => {
  await page.getByRole("button", { name: "Mess pass" }).click();
  await page.waitForURL("**/cafeteria", { timeout: 3000 });
  await page.waitForTimeout(1200);
  const qr = page.locator('[aria-label="Cafeteria QR code"] svg');
  await qr.waitFor({ timeout: 3000 });
  const b = await qr.boundingBox();
  if (!b || b.y < 0 || b.y > 844) throw new Error("QR not in view: " + JSON.stringify(b));
  await noWall();
});
await page.screenshot({ path: SHOTS + "/2-pass-offline.png" });
await step("tap the strip: sheet lists what works offline", async () => {
  await page.locator(".offline-pill").click();
  for (const t of ["Works offline", "Mess pass", "Timetable", "Attendance", "Tasks", "Waits for internet"]) await page.getByRole("dialog").getByText(t, { exact: true }).first().waitFor({ timeout: 2000 });
});
await page.screenshot({ path: SHOTS + "/3-sheet.png" });
await step("sheet tile goes to Timetable", async () => {
  await page.getByRole("dialog").getByText("Timetable", { exact: true }).click();
  await page.waitForURL("**/timetable", { timeout: 3000 });
  await page.waitForTimeout(400);
  if (await page.getByRole("dialog").count()) throw new Error("sheet still open");
});
for (const label of ["Attendance", "Tasks", "Friends", "Today", "Cafeteria"]) {
  await step(`offline tab ${label} draws, no walls`, async () => {
    await page.locator('nav[aria-label="Main"] a', { hasText: label }).first().click();
    await page.waitForTimeout(900);
    await noWall();
    if (!(await page.locator(".offline-strip").count())) throw new Error("strip gone");
  });
}
await step("a screen never opened before (subject page) opens offline", async () => {
  await page.goto(BASE + "/attendance/s1", { waitUntil: "load" });
  await page.getByText("Data Structures").first().waitFor({ timeout: 5000 });
  await noWall();
});
await step("Profile opens offline", async () => {
  await page.goto(BASE + "/settings", { waitUntil: "load" });
  await page.getByText("Appearance").first().waitFor({ timeout: 5000 });
  await noWall();
});
await page.locator('nav[aria-label="Main"] a', { hasText: "Today" }).first().click().catch(() => {});

await ctx.setOffline(false);
await step("network back: online again by itself — 'Back online' flashes, then the strip goes", async () => {
  await page.locator(".offline-pill-back", { hasText: "Back online" }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: SHOTS + "/4-back.png" });
  await page.locator(".offline-strip").waitFor({ state: "detached", timeout: 6000 });
  if (await page.getByRole("alertdialog").count()) throw new Error("a popup asked for a tap");
});

// A line that is "connected" but too weak to use: every answer takes 3 s.
await ctx.route("**/api/ping**", async (r) => {
  await new Promise((res) => setTimeout(res, 3000));
  await r.continue().catch(() => {});
});
await step("weak line several times: 'Low network detected multiple times' asks to switch", async () => {
  const prompt = page.getByRole("alertdialog", { name: "Low network" });
  for (let i = 0; i < 6 && !(await prompt.count()); i++) {
    // Coming back to the app is one of the moments it re-checks the line.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(21000);
  }
  await prompt.getByText("Low network detected multiple times").waitFor({ timeout: 2000 });
  await page.screenshot({ path: SHOTS + "/5-weak.png" });
});
await step("'Switch to offline' turns offline mode on", async () => {
  await page.getByRole("alertdialog").getByRole("button", { name: "Switch to offline" }).click();
  await page.locator(".offline-strip", { hasText: "Offline mode" }).waitFor({ timeout: 2000 });
});
await step("still weak: stays offline (a slow answer doesn't count as back)", async () => {
  await page.waitForTimeout(12000);
  if (!(await page.locator(".offline-strip", { hasText: "Offline mode" }).count())) throw new Error("left offline on a weak line");
});
await ctx.unroute("**/api/ping**");
await step("line good again: back online by itself", async () => {
  await page.locator(".offline-pill-back", { hasText: "Back online" }).waitFor({ timeout: 20000 });
  await page.locator(".offline-strip").waitFor({ state: "detached", timeout: 6000 });
});

// A line that answers nothing at all (connected, but dead).
await ctx.route("**/api/ping**", () => new Promise(() => {}));
await step("dead line (requests hang): offline mode by itself after a reload", async () => {
  await page.reload({ waitUntil: "load" });
  await page.locator(".offline-strip", { hasText: "Offline mode" }).waitFor({ timeout: 20000 });
  await noWall();
});
await ctx.unroute("**/api/ping**");
await step("…and back online by itself", async () => {
  await page.locator(".offline-pill-back", { hasText: "Back online" }).waitFor({ timeout: 20000 });
});
console.log(`\n${ok} ok, ${fail.length} failed`, fail, bad.length ? bad : "");
await browser.close();
process.exit(fail.length || bad.length ? 1 : 0);
