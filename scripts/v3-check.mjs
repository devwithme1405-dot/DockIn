/**
 * DockIn 3 preview (assistant + outpass), end to end in a real browser with a
 * pretend preview phone behind the bridge: the floating DockBot appears only on
 * the preview build, answers from Camu with cards, proposes and confirms a day
 * out pass (opening MyCamu with the details), asks for the mail screenshot on a
 * leave, hears a spoken request, and the Outpass screen saves and keeps history.
 *
 *   node scripts/v3-check.mjs        # against a production build on :3000
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = "/tmp/dockin-shots";
mkdirSync(SHOTS, { recursive: true });

/** Camu as the phone stores it, with classes today and a record behind them. */
function camuFixture() {
  const pad = (n) => String(n).padStart(2, "0");
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const p = (date, from, to, name, code, subId, room) => ({
    date, from, to, name, code, subId, room, teacher: "Divya Singh", kind: "LECTURE", status: "A",
  });
  return {
    overall: { pct: 72, present: 71, total: 87 },
    subjects: [
      { id: "s-dbms", code: "2025CSET200", name: "Database Management Systems", present: 31, total: 43, absent: 12, leave: 0, duty: 0, pct: 72.09 },
      { id: "s-fsd", code: "2025CSET218", name: "Full Stack Development", present: 40, total: 44, absent: 4, leave: 0, duty: 0, pct: 90.9 },
    ],
    periods: [
      p(day(0), "00:01", "00:02", "Database Management Systems ( P-LA-203 )", "CSET200", "s-dbms", "P-LA-203"),
      p(day(0), "23:57", "23:58", "Full Stack Development ( P-CC-315 )", "CSET218", "x", "P-CC-315"),
      p(day(-1), "09:25", "10:25", "Database Management Systems ( P-LA-203 )", "CSET200", "s-dbms", "P-LA-203"),
    ],
    holidays: [{ title: "Diwali Holidays", start: day(-5), end: day(-3) }],
    cafeteria: {
      facility: "First Floor",
      date: new Date().toISOString(),
      qr: "663474b11dd0e9412a1f793f,6899a3e84245c98c34c20825,PERM_CAF_QRCODE,6af67386ab597b7312276d14,80dd59d1fe5aa7e965ee5d6fa655222d8803a0a47cc99e891947f4bc669c6709",
      meals: [
        { meal: "Breakfast", label: "Breakfast 07:30 AM - 09:30 AM", color: "#8ed1fc", items: "Indori Poha\nBoiled Egg\nTea / Coffee" },
        { meal: "Lunch", label: "Lunch 12:00 PM - 03:00 PM", color: "#8ed1fc", items: "Kadai Paneer\nChana Dal\nSteamed Rice\nRoti" },
        { meal: "Snack", label: "Snack 5:00 PM - 06:00 PM", color: "#8ed1fc", items: "Jhal Muri\nTea" },
        { meal: "Dinner", label: "Dinner 08:00 PM - 10:00 PM", color: "#8ed1fc", items: "Aloo Gobhi\nHariyali Dal\nOnion Rice\nRoti" },
      ],
    },
    history: {
      "s-dbms": [
        { date: day(-1), from: "09:25", to: "10:25", present: false, leave: "" },
        { date: day(-2), from: "09:25", to: "10:25", present: true, leave: "" },
        { date: day(-8), from: "09:25", to: "10:25", present: true, leave: "" },
      ],
      "s-fsd": [
        { date: day(-1), from: "11:30", to: "12:30", present: true, leave: "" },
        { date: day(-2), from: "11:30", to: "12:30", present: true, leave: "" },
      ],
    },
    historyAt: Date.now(),
  };
}


const problems = [];
let ok = 0;
async function step(name, fn) {
  try {
    await fn();
    ok++;
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${e.message.split("\n")[0]}`);
    console.log(`FAIL ${name}: ${e.message.split("\n")[0]}`);
  }
}

const browser = await chromium.launch();
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function phone({ channel = "preview", theme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  await page.addInitScript(
    ({ channel, camu }) => {
      const phone = { calls: [], notes: [], spoken: [] };
      const listeners = {};
      let nextId = 1;
      const fire = (event, data) => {
        for (const cb of Object.values(listeners[event] ?? {})) cb(data);
      };
      window.__phone = { get: () => phone, fire };
      const college = { camu: { ...camu, connected: true, syncedAt: Date.now() }, lms: { connected: false } };
      const methods = {
        status: () => ({ notifications: "granted", battery: true, sdk: 34, maker: "Pretend", version: "3.0-preview.1", build: 100 }),
        appReady: () => ({}),
        setLive: () => ({}),
        college: () => college,
        syncCollege: () => college,
        scheduleReminders: () => ({}),
        setWidgets: () => ({}),
        checkUpdate: () => ({ current: 100, latest: 100, name: "3.0-preview.1", ready: false, canInstall: true }),
        channel: () => ({ channel, speech: true }),
        openCamu: (o) => {
          phone.notes.push(o.note);
          return {};
        },
        listen: (o) => {
          phone.lang = o.lang;
          setTimeout(() => fire("speech", { type: "state", state: "ready" }), 100);
          setTimeout(() => fire("speech", { type: "level", level: 0.7 }), 300);
          setTimeout(() => fire("speech", { type: "partial", text: "kal ka" }), 600);
          setTimeout(() => fire("speech", { type: "partial", text: "kal ka timetable" }), 1100);
          return {};
        },
        finishListening: () => {
          setTimeout(() => fire("speech", { type: "final", text: "kal ka timetable" }), 150);
          return {};
        },
        stopListening: () => ({}),
        speak: (o) => {
          phone.spoken.push(o.text);
          return {};
        },
        stopSpeaking: () => ({}),
      };
      window.androidBridge = { postMessage() {} };
      window.Capacitor = {
        PluginHeaders: [
          {
            name: "DockIn",
            methods: [
              ...Object.keys(methods).map((name) => ({ name, rtype: "promise" })),
              { name: "addListener", rtype: "callback" },
              { name: "removeListener", rtype: "promise" },
            ],
          },
        ],
        nativePromise(plugin, method, options) {
          phone.calls.push(method);
          if (method === "removeListener") {
            delete (listeners[options.eventName] ?? {})[options.callbackId];
            return Promise.resolve();
          }
          const fn = methods[method];
          if (!fn) return Promise.reject(new Error(`${method} is not on this pretend phone`));
          try {
            return Promise.resolve(fn(options ?? {}));
          } catch (e) {
            return Promise.reject(e);
          }
        },
        nativeCallback(plugin, method, options, callback) {
          const id = String(nextId++);
          (listeners[options.eventName] ??= {})[id] = callback;
          return id;
        },
      };
    },
    { channel, camu: camuFixture() },
  );
  await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.evaluate(async (theme) => {
    localStorage.setItem("dockin-setup-v1", "1");
    await new Promise((resolve) => {
      const req = indexedDB.open("dockin");
      req.onsuccess = () => {
        const tx = req.result.transaction(["profile"], "readwrite");
        tx.objectStore("profile").put({ id: "me", name: "Sachin Kumar", target: 75, theme, onboarded: true, createdAt: Date.now(), updatedAt: Date.now() });
        tx.oncomplete = () => (req.result.close(), resolve());
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  }, theme);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  return { ctx, page };
}

const ask = (page) => page.getByRole("dialog", { name: "DockBot assistant" });
const say = async (page, text) => {
  await ask(page).getByLabel("Message", { exact: true }).fill(text);
  await ask(page).getByLabel("Send", { exact: true }).click();
};

{
  const { ctx, page } = await phone();
  await step("the preview build shows DockBot's floating button on Today", async () => {
    await page.getByRole("button", { name: "Ask DockBot" }).waitFor({ timeout: 6000 });
    await page.screenshot({ path: `${SHOTS}/v3-today-fab.png` });
  });

  await step("DockBot opens with a greeting and starters", async () => {
    await page.getByRole("button", { name: "Ask DockBot" }).click();
    await ask(page).getByText(/Namaste, Sachin/).waitFor({ timeout: 4000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/v3-ask-empty.png` });
  });

  await step("a starter gets an answer from Camu, with the attendance card", async () => {
    await ask(page).getByRole("button", { name: /Kitni classes bunk/ }).click();
    await ask(page).getByText(/Overall: 81\.6%/).waitFor({ timeout: 5000 });
    await ask(page).getByText(/Can skip/).first().waitFor({ timeout: 3000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/v3-ask-attendance.png` });
  });

  await step("a day out pass: proposed, confirmed, saved, MyCamu opened with the details", async () => {
    await say(page, "kal 3 baje day outpass");
    await ask(page).getByRole("button", { name: /Confirm & open MyCamu/ }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/v3-ask-pass-confirm.png` });
    await ask(page).getByRole("button", { name: /Confirm & open MyCamu/ }).click();
    await ask(page).getByText("Saved in Outpass").waitFor({ timeout: 4000 });
    await page.waitForFunction(() => window.__phone.get().notes.length > 0, null, { timeout: 4000 });
    const note = await page.evaluate(() => window.__phone.get().notes[0]);
    if (!/Day Out Pass/.test(note) || !/3:00 pm/.test(note) || !/7:00 pm/.test(note)) throw new Error(`note was ${note}`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/v3-ask-pass-done.png` });
  });

  await step("a leave waits for the mail screenshot, then can be confirmed", async () => {
    await say(page, "15 to 18 dec leave for home");
    const btn = ask(page).getByRole("button", { name: /Confirm & open MyCamu/ }).last();
    await btn.waitFor({ timeout: 5000 });
    if (await btn.isEnabled()) throw new Error("Confirm was allowed with no screenshot");
    const chooser = page.waitForEvent("filechooser");
    await ask(page).getByRole("button", { name: "Attach", exact: true }).last().click();
    await (await chooser).setFiles({ name: "mail.png", mimeType: "image/png", buffer: PNG });
    await ask(page).getByText(/Screenshot lag gaya/).waitFor({ timeout: 4000 });
    await ask(page).getByText("Parent-approval mail attached ✓").waitFor({ timeout: 3000 });
    if (!(await btn.isEnabled())) throw new Error("still disabled after the screenshot");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/v3-ask-leave.png` });
  });

  await step("talking: the mic listens, shows the words, and sends them", async () => {
    await ask(page).getByLabel("Talk", { exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Talk to DockBot" });
    await panel.getByText("kal ka timetable").waitFor({ timeout: 4000 });
    await page.screenshot({ path: `${SHOTS}/v3-voice.png` });
    const lang = await page.evaluate(() => window.__phone.get().lang);
    if (lang !== "hi-IN") throw new Error(`listened in ${lang}`);
    await panel.getByLabel("Done").click();
    await ask(page).getByText(/Tomorrow/).last().waitFor({ timeout: 5000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/v3-ask-voice-answer.png` });
  });

  await step("Back closes DockBot and the button returns", async () => {
    await page.goBack();
    await page.getByRole("button", { name: "Ask DockBot" }).waitFor({ timeout: 4000 });
    if (await ask(page).count()) throw new Error("still open");
  });

  await step("Outpass from Profile: fill by words, save, stamp, history", async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Outpass Day out/ }).click();
    const sheet = page.getByRole("dialog", { name: "Outpass" });
    await sheet.getByText("Say it like you would to a friend").waitFor({ timeout: 4000 });
    await page.screenshot({ path: `${SHOTS}/v3-outpass-new.png` });
    await sheet.getByPlaceholder("kal 3 baje day out…").fill("kal 4pm day out for bank");
    await sheet.getByLabel("Fill the form").click();
    await page.waitForTimeout(500);
    const reason = await sheet.locator("textarea").inputValue();
    if (!/bank/i.test(reason)) throw new Error(`reason ${reason}`);
    await sheet.getByRole("button", { name: "Save only" }).click();
    await sheet.getByText("Pass saved").waitFor({ timeout: 4000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/v3-outpass-saved.png` });
    await sheet.getByRole("button", { name: "See history" }).click();
    await page.getByRole("dialog", { name: "Outpass" }).last().getByText("Status ·").waitFor({ timeout: 4000 });
    await page.getByRole("button", { name: "Approved" }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/v3-outpass-detail.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/v3-outpass-history.png` });
    const n = await sheet.getByText(/Day Out Pass|Leave ·/).count();
    if (n < 2) throw new Error(`history shows ${n} passes`);
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ theme: "dark" });
  await step("dark: DockBot and Outpass look right", async () => {
    await page.getByRole("button", { name: "Ask DockBot" }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/v3-ask-dark.png` });
    await say(page, "aaj mess mein kya hai");
    await ask(page).getByText("Mess menu").first().waitFor({ timeout: 4000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/v3-ask-dark-mess.png` });
    await ask(page).getByRole("button", { name: "Chat menu" }).click();
    await page.getByRole("button", { name: "Outpass history" }).click();
    await page.getByRole("dialog", { name: "Outpass" }).getByRole("tab", { name: "New pass" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/v3-outpass-dark.png` });
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ channel: "stable" });
  await step("the everyday build shows none of it", async () => {
    await page.waitForTimeout(1500);
    if (await page.getByRole("button", { name: "Ask DockBot" }).count()) throw new Error("FAB on stable");
    await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    if (await page.getByText("DockIn 3 · test build").count()) throw new Error("Profile rows on stable");
  });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : `\nDockIn 3 preview works (${ok} checks).`);
process.exit(problems.length ? 1 : 0);
