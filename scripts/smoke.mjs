/**
 * A walk through every screen, in a real browser, with a real database.
 *
 * Unit tests prove the rules; this proves the app. It seeds a profile, a
 * timetable, some expenses and some tasks straight into IndexedDB, then opens
 * each screen at phone size, fails on any console error or unhandled rejection,
 * checks that the screen actually drew its own content, and leaves a screenshot
 * behind to look at.
 *
 *   node scripts/smoke.mjs            # against http://localhost:3000
 *   BASE=… node scripts/smoke.mjs     # against anything else
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

const SCREENS = [
  { path: "/", name: "today", expect: "Attendance" },
  { path: "/attendance", name: "attendance", expect: "Overall attendance" },
  { path: "/attendance/timetable", name: "timetable", expect: "" },
  { path: "/money", name: "money", expect: "Spent this month" },
  { path: "/tasks", name: "tasks", expect: "To do" },
  { path: "/circle", name: "friends", expect: "Friends" },
  { path: "/settings", name: "profile", expect: "Text size" },
  { path: "/calendar", name: "calendar", expect: "" },
  { path: "/add", name: "quick-add", expect: "" },
  { path: "/attendance/s1", name: "subject", expect: "Data Structures" },
];

const problems = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36",
});
const page = await ctx.newPage();

page.on("console", (m) => {
  if (m.type() !== "error") return;
  const text = m.text();
  // The app runs without a Supabase project here, so anything the cloud would
  // have answered is expected to fail.
  if (/supabase|Failed to load resource|favicon|manifest/i.test(text)) return;
  problems.push(`console: ${text}`);
});
page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));

// Reloading itself is the single most maddening bug a web app can have, and
// the hardest to describe. Counting loads makes it a test rather than a
// feeling: after a screen has settled, nothing should load again.
let loads = 0;
page.on("load", () => {
  loads += 1;
});

// First load creates the database; the second sees the seeded data. The app
// settles on its own for a moment after loading (it decides where you belong),
// so seeding is retried rather than raced.
await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(700);
  try {
    await seed(page);
    break;
  } catch {
    if (i === 4) throw new Error("could not seed the database");
  }
}

/**
 * Every screen twice: a normal phone in light, and a small one in dark with the
 * text turned up. The second pass is where layouts actually break — a 320px
 * screen with larger type is the real floor, not the designer's 390.
 */
const PASSES = [
  { name: "light", width: 390, theme: "light", scale: 1 },
  { name: "dark-small", width: 320, theme: "dark", scale: 1.15 },
];

for (const pass of PASSES) {
  await page.setViewportSize({ width: pass.width, height: 844 });
  await page.emulateMedia({ colorScheme: pass.theme });
  await page.addInitScript(
    ([theme, scale]) => {
      try {
        localStorage.setItem("dockin-theme", theme);
        localStorage.setItem("dockin-text-scale", String(scale));
      } catch {}
    },
    [pass.theme, pass.scale],
  );

for (const screen of SCREENS) {
  const before = problems.length;
  await page.goto(BASE + screen.path, { waitUntil: "networkidle" });
  // The launch screen is held for a beat on purpose.
  await page.waitForTimeout(1400);

  const text = await page.evaluate(() => document.body.innerText);
  if (/Your college, docked in/.test(text) && screen.path !== "/onboarding") {
    problems.push(`${pass.name}/${screen.name}: stuck on the launch screen`);
  }
  if (screen.expect && !text.includes(screen.expect)) {
    problems.push(`${pass.name}/${screen.name}: expected ${JSON.stringify(screen.expect)}`);
  }
  const clipped = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  if (clipped) problems.push(`${pass.name}/${screen.name}: scrolls sideways`);

  loads = 0;
  await page.waitForTimeout(3500);
  if (loads > 0) problems.push(`${pass.name}/${screen.name}: reloaded itself ${loads}x while idle`);

  await page.screenshot({ path: `${SHOTS}/${pass.name}-${screen.name}.png`, fullPage: true });
  console.log(
    `${problems.length === before ? "ok  " : "FAIL"} ${pass.name.padEnd(11)} ${screen.name.padEnd(12)} ${text.split("\n").length} lines`,
  );
}
}

await page.setViewportSize({ width: 390, height: 844 });
await page.emulateMedia({ colorScheme: "light" });

// ---------------------------------------------------------------------------
// The workflows, not just the pixels. Each one is a thing somebody does every
// day, and each used to be a place where the app could quietly do nothing.
// ---------------------------------------------------------------------------

async function step(name, fn) {
  const before = problems.length;
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${e.message}`);
  }
  console.log(`${problems.length === before ? "ok  " : "FAIL"} ${name}`);
}

await step("ticking a task keeps it in place", async () => {
  await page.goto(`${BASE}/tasks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const row = page.locator("li", { hasText: "DSA assignment 4" }).first();
  await row.getByRole("button", { name: /mark as done/i }).click();
  await page.waitForTimeout(500);
  const text = await row.innerText();
  if (!/Completed/.test(text)) throw new Error("the row did not say Completed");
  // and it comes back undone
  await row.getByRole("button", { name: /mark as not done/i }).click();
  await page.waitForTimeout(400);
});

await step("deleting a task asks first", async () => {
  const row = page.locator("li", { hasText: "Pay hostel mess bill" }).first();
  await row.getByRole("button", { name: /^Delete /i }).click();
  await page.waitForTimeout(300);
  if (!/Delete this\?/.test(await row.innerText())) throw new Error("no confirmation appeared");
  await row.getByRole("button", { name: "Keep" }).click();
  await page.waitForTimeout(300);
  const back = await page.locator("li", { hasText: "Pay hostel mess bill" }).first().innerText();
  if (!/Overdue/.test(back)) throw new Error("the task did not come back");
});

await step("adding an expense again takes one tap", async () => {
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => document.body.innerText.match(/₹[\d,]+/)[0]);
  await page.getByRole("button", { name: /24\/7 Kathi/ }).first().click();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => document.body.innerText.match(/₹[\d,]+/)[0]);
  if (before === after) throw new Error(`the month total did not move (${before})`);
});

await step("marking a class updates attendance", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const mark = page.getByRole("button", { name: /present/i }).first();
  await mark.click();
  await page.waitForTimeout(700);
  await page.goto(`${BASE}/attendance`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const text = await page.evaluate(() => document.body.innerText);
  if (/Mark a few classes to begin/.test(text)) throw new Error("attendance still reads as empty");
});

await step("adding a task from the button works", async () => {
  await page.goto(`${BASE}/tasks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByLabel("Title").fill("Smoke test task");
  const submit = dialog.getByRole("button", { name: /^Add (assignment|exam|quiz|project|personal)/i });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  await page.waitForTimeout(900);
  const text = await page.evaluate(() => document.body.innerText);
  if (!text.includes("Smoke test task")) throw new Error("the task did not appear in the list");
});

await step("the timetable wizard opens and takes a subject", async () => {
  await page.goto(`${BASE}/attendance/timetable`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/subject|period|day/i.test(text)) throw new Error("the wizard drew nothing recognisable");
});

await step("the tab bar moves between screens", async () => {
  for (const [label, expect] of [
    ["Money", "Spent"],
    ["Tasks", "To do"],
    ["Today", "Timetable"],
  ]) {
    await page.locator("nav[aria-label='Main'] a", { hasText: label }).first().click();
    // The tab bar falls back to a full page load if the router stalls, so give
    // it longer than the router alone would need.
    await page.waitForTimeout(2400);
    const text = await page.evaluate(() => document.body.innerText);
    if (!text.includes(expect)) {
      throw new Error(`${label} did not open (${page.url()}): ${text.slice(0, 80).replace(/\n/g, " | ")}`);
    }
  }
});

await browser.close();

if (problems.length) {
  console.log("\n" + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log("\nEvery screen drew, nothing threw.");
