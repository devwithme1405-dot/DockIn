/**
 * Render the signed-in half of Friends, with no server behind it.
 *
 * Every screen that only appears once you are signed in is a screen the browser
 * walk cannot reach, and therefore one that can be shipped broken. This plants
 * a session in the place supabase-js keeps one, so the page takes the signed-in
 * branch; every request it then makes fails, which is the point — what is being
 * checked is that the screen draws, and keeps drawing, when the network gives it
 * nothing.
 *
 *   node scripts/signed-in-check.mjs
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const REF = (process.env.SUPABASE_REF ?? "qfwldkdwxkqjmscttlza").trim();
const SHOTS = "/tmp/dockin-shots";
mkdirSync(SHOTS, { recursive: true });

const session = {
  access_token: "fake-access-token",
  refresh_token: "fake-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
};

const problems = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/supabase|Failed to load resource|net::|fetch/i.test(t)) return;
  problems.push(`console: ${t}`);
});

await page.addInitScript(
  ([ref, value]) => {
    try {
      localStorage.setItem(`sb-${ref}-auth-token`, value);
      localStorage.setItem("dockin-app", "1.0.99");
      localStorage.setItem("dockin-app-pay", "1");
    } catch {}
  },
  [REF, JSON.stringify(session)],
);

// A phone that has used the app before: without this the launch screen is held
// on purpose, since a signed-in phone with no data of its own really is still
// fetching it.
await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
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
        theme: "system",
        onboarded: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
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
});

for (const [path, name, must] of [
  ["/circle", "signed-friends", ["Friends", "Groups", "Shared work"]],
  ["/circle?tab=groups", "signed-groups", ["New group", "Join with code"]],
  ["/circle?tab=work", "signed-work", ["Nothing shared yet"]],
  ["/settings", "signed-profile", ["payments from your phone"]],
]) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const text = await page.evaluate(() => document.body.innerText);
  for (const needle of must) {
    // Headings are upper-cased in CSS, so compare without case.
    if (!text.toLowerCase().includes(needle.toLowerCase())) {
      problems.push(`${name}: expected ${JSON.stringify(needle)}`);
    }
  }
  if (/Sign in to share/.test(text)) problems.push(`${name}: fell back to the signed-out screen`);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  console.log(`${problems.length ? "    " : "ok  "} ${name}`);
}

await browser.close();

if (problems.length) {
  console.log("\n" + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log("\nThe signed-in screens draw with nothing behind them.");
