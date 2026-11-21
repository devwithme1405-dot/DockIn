/**
 * In-app updates, end to end in a real browser with a pretend phone behind the
 * bridge (as native-check does): the popup comes up by itself, Update now shows
 * real progress through to Android's confirm step, the one-time "allow installs"
 * step carries on by itself on return, a notification tap always brings it up,
 * "Later" really waits, failures say why with a Try again, and phones with the
 * original updater still update.
 *
 *   node scripts/update-check.mjs        # against a production build on :3000
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = "/tmp/dockin-shots";
mkdirSync(SHOTS, { recursive: true });

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

/** A phone: `v2` = the new updater; `canInstall` = "Install unknown apps" allowed. */
async function phone({ v2, canInstall, failWith = null }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  await page.addInitScript(
    ({ v2, canInstall, failWith }) => {
      const saved = sessionStorage.getItem("fake-phone");
      const phone = saved ? JSON.parse(saved) : { calls: [], canInstall, build: 100, installs: 0 };
      const save = () => sessionStorage.setItem("fake-phone", JSON.stringify(phone));
      const listeners = {};
      let nextId = 1;
      const fire = (event, data) => {
        for (const cb of Object.values(listeners[event] ?? {})) cb(data);
      };
      window.__phone = { get: () => phone, set: (p) => (Object.assign(phone, p), save()), fire };
      const later = (ms, fn) => setTimeout(fn, ms);
      const methods = {
        status: () => ({ notifications: "granted", battery: true, sdk: 34, maker: "Pretend", version: "2.0.1", build: phone.build }),
        appReady: () => ({}),
        setLive: () => ({}),
        college: () => ({ camu: { connected: false }, lms: { connected: false } }),
        syncCollege: () => ({ camu: { connected: false }, lms: { connected: false } }),
        scheduleReminders: () => ({}),
        checkUpdate: () => ({ current: 100, latest: 200, name: "2.0.57", ready: false, canInstall: phone.canInstall }),
        installUpdate: () => {
          phone.installs++;
          if (!phone.canInstall) throw new Error("ALLOW_INSTALL");
          if (!v2) return {}; // the original updater opens Android's screen and is done
          fire("updateState", { state: "downloading" });
          later(150, () => fire("updateProgress", { percent: 35 }));
          later(400, () => fire("updateProgress", { percent: 80 }));
          later(700, () => fire("updateState", { state: "verifying" }));
          later(900, () => fire("updateState", { state: "installing" }));
          later(1100, () =>
            failWith ? fire("updateState", { state: "failed", message: failWith }) : fire("updateState", { state: "confirm" }),
          );
          return {};
        },
      };
      if (v2) methods.updateInfo = () => ({ v: 2, canInstall: phone.canInstall });
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
            const out = fn(options ?? {});
            save();
            return Promise.resolve(out);
          } catch (e) {
            save();
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
    { v2, canInstall, failWith },
  );
  // An onboarded phone that has done setup, so the app opens on Today.
  await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    localStorage.setItem("dockin-setup-v1", "1");
    await new Promise((resolve) => {
      const req = indexedDB.open("dockin");
      req.onsuccess = () => {
        const tx = req.result.transaction(["profile"], "readwrite");
        tx.objectStore("profile").put({ id: "me", name: "Sachin", target: 75, theme: "light", onboarded: true, createdAt: Date.now(), updatedAt: Date.now() });
        tx.oncomplete = () => (req.result.close(), resolve());
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

const dialog = (page) => page.getByRole("dialog", { name: "DockIn update" });

{
  const { ctx, page } = await phone({ v2: true, canInstall: true });
  await step("a new version: the popup comes up by itself", async () => {
    await dialog(page).getByText("DockIn 2.0.57").waitFor({ timeout: 8000 });
    await dialog(page).getByText("New update ready").waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/update-1-popup.png` });
  });
  await step("Update now: download progress, checks, then Android's confirm step", async () => {
    await dialog(page).getByRole("button", { name: "Update now" }).click();
    await dialog(page).getByText(/Downloading… (35|80)%/).waitFor({ timeout: 2000 });
    await page.screenshot({ path: `${SHOTS}/update-2-progress.png` });
    await dialog(page).getByText("Tap “Update” on Android’s screen").waitFor({ timeout: 3000 });
  });
  await step("Hide while it waits: a chip keeps it one tap away", async () => {
    await dialog(page).getByRole("button", { name: "Hide" }).click();
    await page.getByRole("button", { name: "Finish the update" }).click();
    await dialog(page).waitFor({ timeout: 2000 });
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ v2: true, canInstall: false });
  await step("first time: the one-time 'allow installs' step is explained", async () => {
    await dialog(page).getByRole("button", { name: "Update now" }).click({ timeout: 8000 });
    await dialog(page).getByText("One-time step").waitFor({ timeout: 2000 });
    await dialog(page).getByText("The update carries on by itself.").waitFor();
    await page.screenshot({ path: `${SHOTS}/update-3-permission.png` });
  });
  await step("allowed in Settings and back: the update carries on by itself", async () => {
    await page.evaluate(() => {
      window.__phone.set({ canInstall: true });
      window.__phone.fire("resume", {});
    });
    await dialog(page).getByText("Tap “Update” on Android’s screen").waitFor({ timeout: 4000 });
    const n = await page.evaluate(() => window.__phone.get().installs);
    if (n !== 2) throw new Error(`installUpdate called ${n} times`);
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ v2: true, canInstall: true, failWith: "Not enough space on the phone. Free up a little and try again." });
  await step("a failed install says why, with Try again", async () => {
    await dialog(page).getByRole("button", { name: "Update now" }).click({ timeout: 8000 });
    await dialog(page).getByText("Not enough space on the phone.", { exact: false }).waitFor({ timeout: 3000 });
    await dialog(page).getByRole("button", { name: "Try again" }).waitFor();
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ v2: true, canInstall: true });
  await step("'Later' really waits — even after reopening the app", async () => {
    await dialog(page).getByRole("button", { name: "Later" }).click({ timeout: 8000 });
    await page.waitForTimeout(300);
    if (await dialog(page).count()) throw new Error("still showing");
    await page.evaluate(() => localStorage.removeItem("dockin-update-checked"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4500);
    if (await dialog(page).count()) throw new Error("came back right after Later");
  });
  await step("…but tapping the 'update ready' notification always opens it", async () => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("dockin-open", { detail: "/?update=1" })));
    await dialog(page).getByText("DockIn 2.0.57").waitFor({ timeout: 4000 });
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ v2: false, canInstall: true });
  await step("a phone with the original updater still updates (Android's screen opens)", async () => {
    await dialog(page).getByRole("button", { name: "Update now" }).click({ timeout: 8000 });
    await dialog(page).getByText("Tap “Update” on Android’s screen").waitFor({ timeout: 3000 });
  });
  await step("…and if that screen was cancelled, Update now is offered again", async () => {
    await page.evaluate(() => window.__phone.fire("resume", {}));
    await dialog(page).getByRole("button", { name: "Update now" }).waitFor({ timeout: 3000 });
    await dialog(page).getByText("Didn't finish? Tap Update now again.").waitFor();
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ v2: true, canInstall: true });
  await step("after the update: old screens are swapped out, and 'DockIn updated ✓' shows", async () => {
    await dialog(page).waitFor({ timeout: 8000 });
    await page.evaluate(() => window.__phone.set({ build: 200 }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("DockIn updated to 2.0.1 ✓").waitFor({ timeout: 10000 });
  });
  await ctx.close();
}

await browser.close();
console.log(`\n${ok} ok, ${problems.length} problems`);
for (const p of problems) console.log("  - " + p);
process.exit(problems.length ? 1 : 0);
