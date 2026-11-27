/**
 * DockIn 3 preview: the Outpass page, end to end in a real browser with a
 * pretend preview phone behind the bridge. Today shows the way in only on the
 * preview build; a typed line fills the form and asks (two buttons) only about
 * what it can't be sure of; reasons are chips; a leave insists on the mail
 * screenshot and hands it to MyCamu; parents get a ready message; history
 * counts; and the "teach DockIn" notes can be shared.
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
    const pages = browser.contexts().flatMap((c) => c.pages());
    await pages.at(-1)?.screenshot({ path: `${SHOTS}/FAIL-${ok + problems.length}.png` }).catch(() => {});
    console.log(`FAIL ${name}: ${e.message.split("\n")[0]}`);
  }
}

const browser = await chromium.launch();
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function phone({ channel = "preview", theme = "light", direct = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  await page.addInitScript(
    ({ channel, camu, direct }) => {
      const phone = {
        calls: [],
        notes: [],
        spoken: [],
        sentDayOuts: [],
        camuList: direct
          ? [
              (() => {
                const d = (n) => {
                  const x = new Date();
                  x.setDate(x.getDate() + n);
                  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
                };
                return { _id: "6b091aa9d7ae0a838b050ed3", lvId: "lv-block", frdt: `${d(2)}T06:00:00.000Z`, todt: `${d(4)}T19:00:00.000Z`, rson: "Home", prntAp: "SUB", status: "SUB", passTyCode: "LEAVE_OUT_PASS", passTyNme: "Leave Out Pass" };
              })(),
              { _id: "old-1", lvId: "lv-old", frdt: "2026-11-25T18:32:00.000Z", todt: "2026-11-25T19:00:00.000Z", rson: "Outing", prntAp: "APPRVD", status: "CMPT", isCOut: true, cOutDt: "2026-11-25T13:02:44.000Z", isCIn: true, cInDt: "2026-11-25T15:23:35.000Z", passTyCode: "DOP", passTyNme: "Day Out Pass", prntName: "MAHESH" },
              { Rson: "Outing", _id: "twin", LvTy: "Leave", start: "2026-11-25T00:00:00.000Z", end: "2026-11-25T00:00:00.000Z", Stus: "Submitted", refId: "lv-old" },
            ]
          : [],
      };
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
          phone.camu = o;
          return {};
        },
        shareText: (o) => {
          phone.shared = (phone.shared ?? []).concat(o.text);
          return {};
        },
        camuCaptured: () => ({
          items: "[]",
          picked: JSON.stringify([
            { at: 1, page: "/leave", method: "POST", url: "https://student.bennetterp.camu.in/api/leave/apply", body: "{}", status: 200, answer: "{}" },
            { at: 2, page: "/leave", method: "POST", url: "https://student.bennetterp.camu.in/api/upload", body: "{}", status: 200, answer: "{}" },
          ]),
        }),
        clearCamuCaptured: () => ({}),
        camuCanMakePass: () => ({ ok: direct, connected: true, taught: direct }),
        camuDayOut: (o) => {
          phone.sentDayOuts.push(o);
          if (o.reason === "Bank work") return { made: false, code: "DUP_GATEPASS_EXISTS" };
          const rec = { _id: `camu-${phone.sentDayOuts.length}`, lvId: `lv-${phone.sentDayOuts.length}`, passTyCode: "DOP", passTyNme: "Day Out Pass", frdt: `${o.date}T${o.from}:00.000Z`, todt: `${o.date}T${o.to}:00.000Z`, rson: o.reason, prntAp: "SUB", status: "SUB", CrAt: new Date().toISOString() };
          phone.camuList.unshift({ ...rec, prntAp: "APPRVD", prntName: "MAHESH" });
          // MyCamu's quirk: it says "duplicate" for the pass it has just made.
          return { made: true, code: "DUP_GATEPASS_EXISTS", record: JSON.stringify(rec) };
        },
        camuLeaveOut: (o) => {
          phone.sentLeaves = (phone.sentLeaves ?? []).concat({ ...o, proofData: o.proofData.length });
          const rec = { _id: `leave-${phone.sentLeaves.length}`, lvId: `lvl-${phone.sentLeaves.length}`, passTyCode: "LEAVE_OUT_PASS", passTyNme: "Leave Out Pass", frdt: `${o.fromDate}T${o.fromTime}:00.000Z`, todt: `${o.toDate}T${o.toTime}:00.000Z`, rson: o.reason, atcmnt: [{ atchNm: o.proofName }], prntAp: "SUB", status: "SUB" };
          phone.camuList.unshift(rec);
          return { made: true, record: JSON.stringify(rec) };
        },
        camuCancel: (o) => {
          const p = phone.camuList.find((x) => x._id === o.id);
          if (!p) throw Object.assign(new Error("That pass isn't in your MyCamu list."), { code: "invalid" });
          p.status = "CNCL";
          phone.cancelled = (phone.cancelled ?? []).concat(o.id);
          return { cancelled: true, code: "CNCL" };
        },
        camuPasses: () => ({ items: JSON.stringify(phone.camuList) }),
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
    { channel, camu: camuFixture(), direct },
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

const pass = (page) => page.getByRole("dialog", { name: "Outpass" });
const line = async (page, text) => {
  await pass(page).getByLabel("Describe the pass").fill(text);
  await pass(page).getByRole("button", { name: "Fill the form" }).click();
};
const phoneState = (page) => page.evaluate(() => window.__phone.get());

{
  const { ctx, page } = await phone();

  await step("preview: Today has the Outpass card, and no chatbot button", async () => {
    await page.getByRole("region", { name: "Outpass" }).waitFor({ timeout: 6000 });
    if (await page.getByRole("button", { name: "Ask DockBot" }).count()) throw new Error("chatbot button still there");
    await page.getByRole("region", { name: "Outpass" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/op-today.png` });
  });

  await step("Day out from Today opens the page on a day out", async () => {
    await page.getByRole("region", { name: "Outpass" }).getByRole("button", { name: "Day out" }).click();
    await pass(page).waitFor({ timeout: 4000 });
    if ((await pass(page).getByRole("button", { name: /^Day Out/ }).getAttribute("aria-pressed")) !== "true") throw new Error("not on day out");
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/op-new.png` });
  });

  await step("'kal 6 baje market' asks morning or evening, and fills Market", async () => {
    await line(page, "kal 6 baje market");
    await pass(page).getByText("Got it").waitFor({ timeout: 3000 });
    await pass(page).getByText(/Going out at 6:00 — AM or PM\?/).waitFor({ timeout: 3000 });
    await pass(page).getByRole("button", { name: "Make the pass" }).click();
    await pass(page).getByText("Tap AM or PM for 6:00 above.").waitFor({ timeout: 2000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/op-ask.png` });
    await pass(page).getByRole("button", { name: "6:00 PM" }).click();
    if (await pass(page).getByText(/AM or PM\?/).count()) throw new Error("question stayed");
    if ((await pass(page).getByLabel("From time").inputValue()) !== "18:00") throw new Error("time not set");
    if ((await pass(page).getByRole("button", { name: "Market", exact: true }).getAttribute("aria-pressed")) !== "true") throw new Error("reason chip not picked");
    await pass(page).getByText(/then DockIn sends day outs itself/).waitFor({ timeout: 2000 });
  });

  await step("Make the pass: saved, stamped, MyCamu opened with the details", async () => {
    await pass(page).getByRole("button", { name: "Make the pass" }).click();
    await pass(page).getByText("Your pass is ready").waitFor({ timeout: 4000 });
    const st = await phoneState(page);
    if (!st.notes.at(-1)?.includes("Day Out Pass") || !st.notes.at(-1)?.includes("Market")) throw new Error(`note: ${st.notes.at(-1)}`);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${SHOTS}/op-saved.png` });
  });

  await step("Tell parents shares a ready message; 'I submitted' ticks step 1", async () => {
    await pass(page).getByRole("button", { name: "Tell parents" }).click();
    await page.waitForTimeout(300);
    const st = await phoneState(page);
    if (!st.shared?.at(-1)?.includes("Day Out Pass") || !st.shared.at(-1).includes("approve")) throw new Error("no parent message");
    await pass(page).getByRole("button", { name: "I submitted" }).click();
    await pass(page).getByRole("button", { name: "Submitted" }).waitFor({ timeout: 3000 });
  });

  await step("a day out without a reason asks for one; 'Write my own' works", async () => {
    await pass(page).getByRole("button", { name: "New pass" }).last().click();
    await line(page, "kal 4 baje day out");
    await pass(page).getByText(/Going out at 4:00 — AM or PM\?.*tap to confirm/).waitFor({ timeout: 2000 });
    if (!(await pass(page).getByRole("button", { name: /4:00 AM/ }).isDisabled())) throw new Error("4 AM tappable");
    if ((await pass(page).getByLabel("From time").inputValue()) !== "16:00") throw new Error("4 baje is not 4 PM");
    await pass(page).getByRole("button", { name: "Make the pass" }).click();
    await pass(page).getByText("Pick or write a reason.").waitFor({ timeout: 2000 });
    await pass(page).getByRole("button", { name: "Write my own" }).click();
    await pass(page).getByPlaceholder(/Meeting a friend/).fill("Meeting my cousin");
    if (await pass(page).getByText("Pick or write a reason.").count()) throw new Error("error stayed");
  });

  await step("a leave needs the mail screenshot, then hands it to MyCamu", async () => {
    await line(page, "kal se 3 din ghar");
    if ((await pass(page).getByRole("button", { name: /^Leave Out for/ }).getAttribute("aria-pressed")) !== "true") throw new Error("not a leave");
    if ((await pass(page).getByRole("button", { name: "Going home", exact: true }).getAttribute("aria-pressed")) !== "true") throw new Error("reason not found");
    await pass(page).getByRole("button", { name: "Make the pass" }).click();
    await pass(page).getByText(/needs the parent-approval mail/).waitFor({ timeout: 2000 });
    const chooser = page.waitForEvent("filechooser");
    await pass(page).getByRole("button", { name: /Attach the screenshot/ }).click();
    await (await chooser).setFiles({ name: "mail.png", mimeType: "image/png", buffer: PNG });
    await pass(page).getByText("Attached ✓").waitFor({ timeout: 2000 });
    await page.screenshot({ path: `${SHOTS}/op-leave.png` });
    await pass(page).getByRole("button", { name: "Make the pass" }).click();
    await pass(page).getByText("Your pass is ready").waitFor({ timeout: 4000 });
    const st = await phoneState(page);
    if (!st.camu?.proofData || !/^mail-screenshot\.(png|jpg)$/.test(st.camu.proofName)) throw new Error("no proof sent to MyCamu");
    if (!st.notes.at(-1)?.includes("Leave")) throw new Error("leave note missing");
    await pass(page).getByText(/pick “The mail screenshot from DockIn”/).waitFor({ timeout: 2000 });
  });

  await step("history: counts, filters, and the teach-DockIn notes", async () => {
    await pass(page).getByRole("button", { name: "See history" }).click();
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(600);
    const sheet = page.getByRole("dialog", { name: "Outpass" }).last();
    if (await sheet.getByText("Status ·").count()) await page.goBack();
    await page.waitForTimeout(500);
    await pass(page).first().getByText("This month").waitFor({ timeout: 3000 });
    await pass(page).first().getByRole("button", { name: "Leave", exact: true }).click();
    if ((await pass(page).first().locator(".pass-ticket").count()) !== 1) throw new Error("leave filter");
    await pass(page).first().getByRole("button", { name: "All", exact: true }).click();
    await pass(page).first().getByRole("button", { name: /Teach DockIn to submit for you/ }).click();
    await pass(page).first().getByText(/MyCamu submit noted ✓/).waitFor({ timeout: 3000 });
    await pass(page).first().getByText(/POST \/api\/leave\/apply/).waitFor({ timeout: 2000 });
    await page.screenshot({ path: `${SHOTS}/op-history.png`, fullPage: false });
    await pass(page).first().getByRole("button", { name: "Share with team" }).click();
    await page.waitForTimeout(300);
    const st = await phoneState(page);
    if (!st.shared?.at(-1)?.includes("2 sent")) throw new Error("notes not shared");
  });

  await step("Back closes the page; Today shows the live pass", async () => {
    await page.goBack();
    await page.waitForTimeout(700);
    if (await pass(page).count()) throw new Error("still open");
    await page.getByRole("region", { name: "Outpass" }).getByText(/Leave ·|Day out ·/).waitFor({ timeout: 3000 });
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ direct: true });
  await step("taught phone: review, send, MyCamu's 'duplicate' ignored, read back and checked", async () => {
    await page.getByRole("region", { name: "Outpass" }).getByRole("button", { name: "Day out" }).click();
    await line(page, "kl 4 bje mkt");
    await pass(page).getByRole("button", { name: "Submit to MyCamu" }).click();
    const review = page.getByRole("dialog", { name: "Send this to MyCamu?" });
    await review.getByText("4:00 pm → 7:00 pm").waitFor({ timeout: 3000 });
    await page.screenshot({ path: `${SHOTS}/op-review.png` });
    await review.getByRole("button", { name: "Yes, send it" }).click();
    await pass(page).getByText("Sent to MyCamu").waitFor({ timeout: 5000 });
    await pass(page).getByText("Checked in MyCamu — all correct").waitFor({ timeout: 3000 });
    const st = await phoneState(page);
    const sent = st.sentDayOuts.at(-1);
    if (!sent || sent.from !== "16:00" || sent.to !== "19:00" || sent.reason !== "Market") throw new Error(`sent ${JSON.stringify(sent)}`);
    if (st.notes.length) throw new Error("opened MyCamu too");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/op-sent.png` });
  });

  await step("a pass that would clash shows the MyCamu pass in the way, cancellable right there", async () => {
    await pass(page).getByRole("button", { name: "New pass" }).last().click();
    await line(page, "parso 4 baje market");
    await pass(page).getByRole("button", { name: "Submit to MyCamu" }).click();
    const review = page.getByRole("dialog", { name: "Send this to MyCamu?" });
    const clash = review.getByRole("alert", { name: "Clashes in MyCamu" });
    await clash.getByText("This pass in MyCamu overlaps it:").waitFor({ timeout: 4000 });
    await clash.getByText("Leave Out Pass").waitFor();
    if (!(await review.getByRole("button", { name: "Cancel the clash first" }).isDisabled())) throw new Error("could send over a clash");
    await page.screenshot({ path: `${SHOTS}/op-clash.png` });
    await clash.getByRole("button", { name: "Cancel this pass" }).click();
    await clash.getByRole("button", { name: "Yes, cancel" }).click();
    await review.getByRole("button", { name: "Yes, send it" }).waitFor({ timeout: 5000 });
    const st = await phoneState(page);
    if (st.cancelled?.at(-1) !== "6b091aa9d7ae0a838b050ed3") throw new Error("didn't cancel the right pass");
    await review.getByRole("button", { name: "Yes, send it" }).click();
    await pass(page).getByText("Sent to MyCamu").waitFor({ timeout: 5000 });
  });

  await step("MyCamu's refusal is shown in words, nothing saved", async () => {
    await pass(page).getByRole("button", { name: "New pass" }).last().click();
    await line(page, "kal subah 8 se 11 bank");
    await pass(page).getByRole("button", { name: "Submit to MyCamu" }).click();
    await page.getByRole("dialog", { name: "Send this to MyCamu?" }).getByRole("button", { name: "Yes, send it" }).click();
    await pass(page).getByRole("alert").getByText(/overlaps this time/).waitFor({ timeout: 3000 });
    await page.screenshot({ path: `${SHOTS}/op-refused.png` });
    if ((await page.evaluate(() => window.__phone.get().notes.length)) !== 0) throw new Error("opened MyCamu");
  });

  await step("a leave with its screenshot goes straight in too, and is checked", async () => {
    await pass(page).getByRole("button", { name: "Make the pass" }).or(pass(page).getByRole("button", { name: "Submit to MyCamu" })).first().waitFor();
    const nm = new Date();
    nm.setMonth(nm.getMonth() + 1);
    const mon = nm.toLocaleString("en", { month: "short" }).toLowerCase();
    await line(page, `20 ${mon} se 22 ${mon} ghar`);
    if (await pass(page).getByRole("button", { name: "Submit to MyCamu" }).count()) throw new Error("leave without screenshot offered straight send");
    const chooser = page.waitForEvent("filechooser");
    await pass(page).getByRole("button", { name: /Attach the screenshot/ }).click();
    await (await chooser).setFiles({ name: "mail.png", mimeType: "image/png", buffer: PNG });
    await pass(page).getByRole("button", { name: "Submit to MyCamu" }).click();
    const review = page.getByRole("dialog", { name: "Send this to MyCamu?" });
    await review.getByText("Mail screenshot goes with it").waitFor({ timeout: 3000 });
    await review.getByRole("button", { name: "Yes, send it" }).click();
    await pass(page).getByText("Sent to MyCamu").waitFor({ timeout: 5000 });
    await pass(page).getByText("Checked in MyCamu — all correct").waitFor({ timeout: 3000 });
    const st = await phoneState(page);
    const l = st.sentLeaves?.at(-1);
    if (!l || l.reason !== "Going home" || !l.proofData || !/^mail-screenshot\./.test(l.proofName)) throw new Error(`leave sent ${JSON.stringify(l)}`);
    if (st.notes.length) throw new Error("opened MyCamu");
    await page.screenshot({ path: `${SHOTS}/op-leave-sent.png` });
    await pass(page).getByRole("button", { name: "New pass" }).last().click();
  });

  await step("History shows MyCamu's own passes: approval, out and back times", async () => {
    await pass(page).getByText(/^History/).first().click();
    await pass(page).getByText(/From MyCamu · updated/).waitFor({ timeout: 4000 });
    await pass(page).getByText("Approved").first().waitFor({ timeout: 3000 });
    await pass(page).getByText("Back in").first().waitFor({ timeout: 3000 });
    await pass(page).getByText(/Out 6:32 pm/i).first().waitFor({ timeout: 3000 });
    await pass(page).getByRole("group", { name: "Status" }).getByRole("button", { name: /Cancelled/ }).click();
    if ((await pass(page).locator(".pass-ticket").count()) !== 1) throw new Error("cancelled filter");
    await pass(page).getByText("Leave Out Pass").first().waitFor();
    await page.screenshot({ path: `${SHOTS}/op-filter.png` });
    await pass(page).getByRole("group", { name: "Status" }).getByRole("button", { name: "Any status" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/op-camu-history.png` });
    await pass(page).getByText("Back in").first().click();
    await page.getByText(/Parent ok · MAHESH/).waitFor({ timeout: 3000 });
    await page.screenshot({ path: `${SHOTS}/op-camu-sheet.png` });
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ theme: "dark" });
  await step("dark: the page, a question and the saved ticket look right", async () => {
    await page.getByRole("region", { name: "Outpass" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/op-today-dark.png` });
    await page.getByRole("region", { name: "Outpass" }).getByRole("button", { name: "Day out" }).click();
    await line(page, "kal 6 baje movie");
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/op-ask-dark.png` });
    await pass(page).getByRole("button", { name: "6:00 PM" }).click();
    await pass(page).getByRole("button", { name: "Make the pass" }).click();
    await pass(page).getByText("Your pass is ready").waitFor({ timeout: 4000 });
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${SHOTS}/op-saved-dark.png` });
  });
  await ctx.close();
}

{
  const { ctx, page } = await phone({ channel: "stable" });
  await step("the everyday build shows none of it", async () => {
    await page.waitForTimeout(1500);
    if (await page.getByRole("region", { name: "Outpass" }).count()) throw new Error("Outpass on stable");
    await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    if (await page.getByText("DockIn 3 · test build").count()) throw new Error("Profile rows on stable");
  });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : `\nOutpass preview works (${ok} checks).`);
process.exit(problems.length ? 1 : 0);
