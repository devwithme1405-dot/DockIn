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
  ({ inbox }) => {
    // What the phone knows. Persisted per tab so a reload keeps it.
    const saved = sessionStorage.getItem("fake-phone");
    const phone = saved
      ? JSON.parse(saved)
      : { listening: false, notifications: "prompt", inbox, calls: [] };
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
        pending: phone.inbox.length,
        sdk: 34,
        maker: "Pretend",
        version: "2.0.1",
        build: 1,
      }),
      openListenerSettings: () => ({}),
      openAppSettings: () => ({}),
      openNotificationSettings: () => ({}),
      requestNotifications: () => {
        phone.notifications = "granted";
        return { notifications: "granted" };
      },
      testPrompt: () => ({ notifications: phone.notifications }),
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
        const out = fn(options ?? {});
        save();
        return Promise.resolve(out);
      },
      nativeCallback(plugin, method, options, callback) {
        const id = String(nextId++);
        (listeners[options.eventName] ??= {})[id] = callback;
        return id;
      },
    };
  },
  {
    inbox: [
      // One spend reported twice (bank SMS, then GPay), an advert, and a refund.
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

await step("the app knows it is inside the phone", async () => {
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await waitFor("Read payment notifications");
  const t = await text();
  if (/Payments are read by the Android app/i.test(t)) throw new Error("shows the browser version of the card");
  if (!/App 2\.0\.1 · Android 14/.test(t)) throw new Error("does not show the app and Android version");
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
  await page.getByRole("button", { name: "Allow" }).click();
  await waitFor("Reading your payments");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/native-setup-on.png`, fullPage: true });
});

await step("Money shows the bank's and GPay's copy as one payment", async () => {
  await page.goto(`${BASE}/money`, { waitUntil: "domcontentloaded" });
  await waitFor("A payment to add");
  const t = await text();
  if (!t.includes("24/7 Kathi")) throw new Error("the payee from GPay is missing");
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

await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nThe app drives the phone correctly.");
