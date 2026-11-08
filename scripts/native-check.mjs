/**
 * The app as it runs inside the Android shell, with a pretend phone behind it.
 *
 * In the APK, Capacitor injects a bridge before the page's own scripts, and
 * `DockIn.*` calls go to Java. Here the same bridge is planted by hand and
 * answered from a small in-page model of the phone, so every web-side path of
 * payment reading can be walked without an emulator: the setup card turning
 * green, the tray filling from the phone's inbox, a dismiss reaching the phone,
 * and a notification tap opening Money.
 *
 *   node scripts/native-check.mjs
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = "/tmp/dockin-shots";
mkdirSync(SHOTS, { recursive: true });

const GPAY = "com.google.android.apps.nbu.paisa.user";
const SMS = "com.google.android.apps.messaging";
const now = Date.now();

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
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource|net::|supabase/i.test(m.text())) {
    problems.push(`console: ${m.text()}`);
  }
});

await page.addInitScript(
  ({ inbox, camuReady, lmsReady }) => {
    // What the phone knows. Persisted per tab so a reload keeps it.
    const saved = sessionStorage.getItem("fake-phone");
    const phone = saved
      ? JSON.parse(saved)
      : { listening: false, notifications: "prompt", sms: "prompt", inbox, calls: [], college: { camu: { connected: false }, lms: { connected: false } }, camuReady, lmsReady };
    const save = () => sessionStorage.setItem("fake-phone", JSON.stringify(phone));
    const listeners = {};
    let nextId = 1;

    window.__phone = {
      get: () => phone,
      set(patch) {
        Object.assign(phone, patch);
        save();
      },
      fire(event, data) {
        for (const cb of Object.values(listeners[event] ?? {})) cb(data);
      },
    };

    const methods = {
      status: () => ({
        listening: phone.listening,
        notifications: phone.notifications,
        sms: phone.sms ?? "prompt",
        pending: phone.inbox.length,
        sdk: 34,
        maker: "Pretend",
        version: "2.0.1",
        build: 1,
      }),
      openListenerSettings: () => ({}),
      appReady: () => ({}),
      openAppSettings: () => ({}),
      openNotificationSettings: () => ({}),
      requestNotifications: () => {
        phone.notifications = "granted";
        return { notifications: "granted" };
      },
      requestSms: () => {
        phone.sms = "granted";
        return { sms: "granted" };
      },
      testPrompt: () => ({ notifications: phone.notifications }),
      college: () => phone.college,
      syncCollege: () => {
        phone.college = { ...phone.college, syncedAt: Date.now() };
        return phone.college;
      },
      scheduleReminders: ({ items }) => {
        phone.reminders = items ?? [];
        return {};
      },
      connectCamu: () => {
        phone.college = { ...phone.college, camu: { ...phone.camuReady, connected: true, syncedAt: Date.now() } };
        return phone.college;
      },
      renewCamu: () => {
        phone.renewCalls = (phone.renewCalls ?? 0) + 1;
        // The remembered Microsoft sign-in comes back without a prompt.
        phone.college = { ...phone.college, camu: { ...phone.camuReady, connected: true, expired: false, syncedAt: Date.now() } };
        return phone.college;
      },
      connectLms: ({ username, password }) => {
        if (password !== "right") throw new Error("Wrong username or password.");
        phone.college = { ...phone.college, lms: { ...phone.lmsReady, connected: true, name: username, syncedAt: Date.now() } };
        return phone.college;
      },
      disconnectCollege: ({ which }) => {
        phone.college = { ...phone.college, [which]: { connected: false } };
        return phone.college;
      },
      pending: () => ({ notices: phone.inbox }),
      ack: ({ ids }) => {
        phone.inbox = phone.inbox.filter((n) => !ids.includes(n.id));
        return {};
      },
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
          save();
          return Promise.resolve();
        }
        const fn = methods[method];
        if (!fn) return Promise.reject(new Error(`${plugin}.${method} is not on this pretend phone`));
        try {
          const out = fn(options ?? {});
          save();
          return Promise.resolve(out);
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
  {
    camuReady: camuFixture(),
    lmsReady: {
      items: [
        {
          id: 70,
          instance: 7,
          module: "assign",
          name: "Lab 7: Joins",
          course: "Database Management Systems (CSET200)",
          due: Math.floor(now / 1000) + 2 * 86400,
          url: "https://lms.bennett.edu.in/mod/assign/view.php?id=7",
          overdue: false,
          action: "Add submission",
        },
      ],
    },
    inbox: [
      // One spend reported twice (bank SMS, then GPay), an advert, and money in.
      { id: "n1", app: SMS, title: "HDFCBK", body: "Rs.60 debited from account to VPA kathi@okaxis", at: now - 60_000 },
      { id: "n2", app: GPAY, title: "You paid ₹60.00", body: "to 24/7 Kathi", at: now - 58_000 },
      { id: "n3", app: GPAY, title: "Offer", body: "Get cashback up to ₹100 when you pay", at: now - 50_000 },
      { id: "n4", app: GPAY, title: "₹250 received", body: "Rahul paid you ₹250", at: now - 40_000 },
    ],
  },
);

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${e.message}`);
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

const text = () => page.evaluate(() => document.body.innerText);
const waitFor = (needle, timeout = 8000) =>
  page.waitForFunction((n) => document.body.innerText.toLowerCase().includes(n.toLowerCase()), needle, { timeout });

// An onboarded phone, so the app opens on its screens rather than the welcome.
await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.evaluate(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.open("dockin");
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["profile"], "readwrite");
      tx.objectStore("profile").put({
        id: "me",
        name: "Sachin",
        target: 75,
        theme: "light",
        onboarded: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => resolve();
    };
    req.onerror = () => resolve();
  });
});

await step("setup comes up once, straight after opening the app", async () => {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/setup$/, { timeout: 8000 });
  await waitFor("Set up DockIn once");
  const t = await text();
  for (const want of ["Connect Camu", "Connect the LMS", "Read payment notifications"]) {
    if (!t.includes(want)) throw new Error(`setup is missing "${want}"`);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/native-setup-screen.png`, fullPage: true });
  await page.getByRole("button", { name: "Skip the rest for now" }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 8000 });
  await page.goto(`${BASE}/tasks`, { waitUntil: "domcontentloaded" });
  await waitFor("Tasks");
  if (page.url().endsWith("/setup")) throw new Error("setup was forced a second time");
});

await step("the app knows it is inside the phone", async () => {
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await waitFor("Read payment notifications");
  const t = await text();
  if (/Payments are read by the Android app/i.test(t)) throw new Error("shows the browser version of the card");
  if (!/App 2\.0\.1 · Android 14/.test(t)) throw new Error("does not show the app and Android version");
  if (!t.includes("Connect Camu")) throw new Error("Profile has no Camu switch");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/native-setup-off.png`, fullPage: true });
});

await step("Turn on opens Android's switch", async () => {
  await page.getByRole("button", { name: "Turn on" }).click();
  await page.waitForTimeout(300);
  const calls = await page.evaluate(() => window.__phone.get().calls);
  if (!calls.includes("openListenerSettings")) throw new Error(`calls were ${calls.join(", ")}`);
});

await step("coming back from Settings ticks the step without a refresh", async () => {
  await page.evaluate(() => {
    window.__phone.set({ listening: true });
    window.__phone.fire("resume", {});
  });
  await waitFor("Only payment apps and bank messages are looked at");
});

await step("Allow asks for notifications, and the card goes green", async () => {
  await page
    .locator("li", { hasText: "Ask me right after I pay" })
    .getByRole("button", { name: "Allow" })
    .click();
  await waitFor("Reading your payments");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/native-setup-on.png`, fullPage: true });
});

await step("Allow turns on reading bank payment SMS", async () => {
  await page
    .locator("li", { hasText: "Read bank payment SMS" })
    .getByRole("button", { name: "Allow" })
    .click();
  await waitFor("even when no notification shows");
  const sms = await page.evaluate(() => window.__phone.get().sms);
  if (sms !== "granted") throw new Error("SMS access was not granted");
});

await step("Money shows the bank's and GPay's copy as one payment, and money in apart", async () => {
  await page.goto(`${BASE}/money`, { waitUntil: "domcontentloaded" });
  await waitFor("to place");
  const t = await text();
  if (!t.includes("24/7 Kathi")) throw new Error("the payee from GPay is missing");
  if (!/\+₹250\s*from Rahul/.test(t)) throw new Error("the money from Rahul is not shown as money in");
  if (/turn on payment reading/i.test(t)) throw new Error("the setup nudge shows although everything is on");
  // the advert was never shown and has left the phone's inbox
  const left = await page.evaluate(() => window.__phone.get().inbox.map((n) => n.id));
  if (left.includes("n3")) throw new Error("the advert is still in the phone's inbox");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/native-money-tray.png`, fullPage: true });
});

await step("dismissing a payment clears both copies on the phone", async () => {
  await page.getByRole("button", { name: /Ignore ₹60/ }).click();
  await page.waitForTimeout(400);
  const left = await page.evaluate(() => window.__phone.get().inbox.map((n) => n.id));
  if (left.includes("n1") || left.includes("n2")) throw new Error(`still on the phone: ${left.join(", ")}`);
});

await step("a payment arriving while Money is open shows up by itself", async () => {
  await page.evaluate((at) => {
    const n = { id: "n9", app: "com.phonepe.app", title: "Payment successful", body: "₹149 paid to Monginis", at };
    window.__phone.set({ inbox: [...window.__phone.get().inbox, n] });
    window.__phone.fire("notice", n);
  }, Date.now());
  await waitFor("Monginis");
});

await step("a payment for a friend goes to lena-dena, not spending", async () => {
  const row = page.locator("div.flex.items-center.gap-3", { hasText: "Monginis" }).last();
  await row.getByRole("button", { name: "Place" }).click();
  await page.getByRole("tab", { name: "For someone" }).click();
  await page.getByPlaceholder("Who? (Rahul)").fill("Rahul");
  await page.getByRole("button", { name: "Add to lena-dena" }).click();
  await waitFor("owes you");
  const t = await text();
  if (!/Lena hai\s*₹149/.test(t)) throw new Error("lena-dena does not show ₹149 to get back");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/native-money-udhaar.png`, fullPage: true });
});

await step("money in from someone who owes you ticks them off in one tap", async () => {
  await waitFor("Rahul owes you ₹149");
  await page.getByRole("button", { name: "Paid back" }).click();
  await waitFor("Money in");
  const t = await text();
  if (!/Lena hai\s*₹0/.test(t)) throw new Error("Rahul still shows as owing");
  if (!t.includes("+₹101")) throw new Error("the extra ₹101 was not noted as money in");
});

await step("a payment notification's For someone button opens that payment, ready", async () => {
  const at = Date.now();
  await page.evaluate((at) => {
    const n = { id: "n10", app: "com.google.android.apps.nbu.paisa.user", title: "You paid ₹99", body: "to Chai Point", at };
    window.__phone.set({ inbox: [...window.__phone.get().inbox, n] });
    window.__phone.fire("notice", n);
    window.__phone.fire("open", { path: `/money?pay=99&at=${at}&who=other` });
  }, at);
  await page.getByRole("tab", { name: "For someone", selected: true }).waitFor({ timeout: 8000 });
  const t = await text();
  if (!t.includes("₹99 at Chai Point")) throw new Error("the sheet is not about the ₹99 payment");
  await page.keyboard.press("Escape");
});

await step("tapping the payment notification opens Money", async () => {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await waitFor("Timetable");
  await page.evaluate(() => window.__phone.fire("open", { path: "/money" }));
  await page.waitForURL(/\/money$/, { timeout: 8000 });
});

await step("Money nudges while payment reading is off", async () => {
  await page.evaluate(() => window.__phone.set({ listening: false }));
  await page.goto(`${BASE}/money`, { waitUntil: "domcontentloaded" });
  await waitFor("Turn on payment reading");
});

await step("connecting Camu turns Attendance into Camu's numbers", async () => {
  await page.goto(`${BASE}/attendance`, { waitUntil: "domcontentloaded" });
  await waitFor("Connect Camu");
  await page.getByRole("button", { name: "Connect", exact: true }).first().click();
  await waitFor("From Camu");
  // 71 of 87 is 81.6%, shown rounded like Camu (the figure counts up to it).
  await waitFor("82%").catch(() => {
    throw new Error("the overall figure is not Camu's 71 of 87 (rounded)");
  });
  const t = await text();
  if (!t.includes("Database Management Systems")) throw new Error("Camu's subjects are missing");
  if (t.includes("Open timetable")) throw new Error("still asks for a hand-made timetable");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/native-camu-attendance.png`, fullPage: true });
});

await step("a subject opens every class Camu recorded", async () => {
  await page.getByRole("button", { name: /Database Management Systems/ }).first().click();
  await waitFor("Missed 1 class");
  const t = await text();
  if (!t.includes("Absent") || !t.includes("Present")) throw new Error("the class list is missing");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/native-camu-history.png` });
  await page.keyboard.press("Escape");
});

await step("the Log lists classes by present/absent across subjects", async () => {
  await page.goto(`${BASE}/attendance`, { waitUntil: "domcontentloaded" });
  await waitFor("From Camu");
  await page.getByRole("tab", { name: "History" }).click();
  await waitFor("Database Management Systems");
  // Filter to just absences, and the present-only class should drop out.
  await page.getByRole("tab", { name: "absent", exact: true }).click();
  await page.waitForTimeout(300);
  const t = await text();
  if (!/Absent/.test(t)) throw new Error("the absent class is missing from the log");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/native-camu-log.png`, fullPage: true });
});

await step("the holiday calendar and trip calculator live on the timetable", async () => {
  await page.goto(`${BASE}/timetable`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Calendar" }).click();
  await waitFor("Trip calculator");
  const t = await text();
  if (!/Next holiday/.test(t)) throw new Error("the next-holiday card is missing");
  if (!/next two weeks/i.test(t)) throw new Error("the fortnight section is missing");
  // A trip over the next few days shows the resulting figure and the subjects it hits.
  const pad = (n) => String(n).padStart(2, "0");
  const to = new Date();
  to.setDate(to.getDate() + 5);
  await page.getByLabel("Trip end").fill(`${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`);
  await page.waitForTimeout(400);
  const t2 = await text();
  if (!/would become|Nothing changes/.test(t2)) throw new Error("the trip result is missing");
  await page.screenshot({ path: `${SHOTS}/native-calendar.png`, fullPage: true });
});

await step("Today shows Camu's classes with the room, and nothing to mark", async () => {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await waitFor("From Camu");
  const t = await text();
  if (!t.includes("P-CC-315")) throw new Error("the room is missing");
  if (!t.includes("Full Stack Development")) throw new Error("today's class is missing");
  if (await page.getByRole("button", { name: "Present" }).count()) throw new Error("there are marking buttons on a Camu class");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/native-camu-today.png`, fullPage: true });
});

await step("the app hands the phone a list of reminders to fire", async () => {
  await page.waitForFunction(() => Array.isArray(window.__phone.get().reminders), null, { timeout: 8000 });
  const r = await page.evaluate(() => window.__phone.get().reminders);
  if (!Array.isArray(r)) throw new Error("no reminders were scheduled");
  // Each reminder carries a future time, a title and the screen to open.
  for (const it of r) {
    if (typeof it.at !== "number" || !it.title || !it.path) throw new Error("a reminder is malformed");
  }
});

await step("an expired Camu session renews itself without being asked", async () => {
  // The phone reports the session ended and pushes that to the open app.
  await page.evaluate(() => {
    const c = window.__phone.get().college;
    const expired = { ...c, camu: { ...c.camu, connected: true, expired: true } };
    window.__phone.set({ college: expired, renewCalls: 0 });
    window.__phone.fire("college", expired);
  });
  // The app asks the phone to renew once, and attendance comes back by itself.
  await page.waitForFunction(() => window.__phone.get().renewCalls === 1, null, { timeout: 8000 });
  await waitFor("From Camu");
  const calls = await page.evaluate(() => window.__phone.get().renewCalls);
  if (calls !== 1) throw new Error(`renew was asked ${calls} times, not once`);
  const expired = await page.evaluate(() => !!window.__phone.get().college.camu.expired);
  if (expired) throw new Error("still expired after renewing");
});

await step("the LMS refuses a wrong password, then fills Tasks", async () => {
  await page.goto(`${BASE}/tasks`, { waitUntil: "domcontentloaded" });
  await waitFor("Connect the LMS");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByPlaceholder("LMS username").fill("e23cseu0001");
  await page.getByPlaceholder("LMS password").fill("wrong");
  await page.getByRole("button", { name: "Sign in to the LMS" }).click();
  await waitFor("Wrong username or password");
  await page.getByPlaceholder("LMS password").fill("right");
  await page.getByRole("button", { name: "Sign in to the LMS" }).click();
  await waitFor("From your LMS");
  const t = await text();
  if (!t.includes("Lab 7: Joins")) throw new Error("the LMS assignment is missing");
  if (!t.includes("LMS")) throw new Error("the task does not say it came from the LMS");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/native-lms-tasks.png`, fullPage: true });
});

await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nThe app drives the phone correctly.");
