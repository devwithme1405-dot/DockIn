/**
 * DockIn Admin (/admin) against a fake Supabase: the door (signed out, not an
 * admin), and for an owner every section on a laptop and a phone, light and
 * dark — numbers, the students list and one student, suspending, sending a
 * notification (with its reach), reviewing a report, health and settings.
 *
 *   node scripts/admin-check.mjs        # against a production build on :3000
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const REF = (process.env.SUPABASE_REF ?? "qfwldkdwxkqjmscttlza").trim();
const SHOTS = "/tmp/dockin-shots";
mkdirSync(SHOTS, { recursive: true });

const ME = "00000000-0000-4000-8000-000000000001";
const t = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString();
const user = { id: ME, aud: "authenticated", role: "authenticated", email: "sachin@dockin.app", app_metadata: {}, user_metadata: {}, created_at: t(99999) };
const session = { access_token: "fake", refresh_token: "fake", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };

const pad = (n) => String(n).padStart(2, "0");
const day = (back) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const series = Array.from({ length: 30 }, (_, i) => {
  const k = 29 - i;
  const grow = i / 29;
  return {
    d: day(k),
    signups: Math.round(2 + grow * 9 + ((i * 7) % 5)),
    active: Math.round(18 + grow * 70 + ((i * 13) % 11) - (i % 7 === 6 ? 12 : 0)),
    messages: Math.round(40 + grow * 260 + ((i * 17) % 40)),
    downloads: Math.round(1 + grow * 6 + ((i * 3) % 4)),
  };
});
const overview = {
  users: 214, new_today: 9, new_7d: 61, online: 7, dau: 88, wau: 151, mau: 196, seen: 196, android: 171, web: 25, preview: 1, profiles: 205,
  camu: 158, lms: 74, notif_on: 139, push: 162, push_instant: 118, with_friends: 97, groups: 23, messages_today: 312, messages_7d: 1840,
  reports_open: 2, banned: 1, errors_24h: 3, downloads: 143, downloads_7d: 38,
  versions: [{ v: "2.0.131", n: 96 }, { v: "2.0.128", n: 41 }, { v: "2.0.120", n: 22 }, { v: "web", n: 25 }, { v: "2.0.97", n: 11 }, { v: "3.0-preview.2", n: 1 }],
  series,
};
const names = ["Harshit Jain", "Yash Raj", "Riya Sharma", "Aman Verma", "Priya Singh", "Kabir Mehta", "Ananya Gupta", "Vaibhav Sharma", "Ishaan Roy", "Neha Kapoor"];
const users = names.map((n, i) => ({
  id: `00000000-0000-4000-8000-0000000001${pad(i)}`,
  username: n.split(" ")[0].toLowerCase() + (i + 1),
  name: n,
  code: `CODE${1000 + i}`,
  branch: "CSE",
  year: 2,
  section: `E${(i % 3) + 1}`,
  avatar: null,
  created_at: t(60 * 24 * (i * 3 + 1)),
  last_seen: i === 6 ? null : t(i === 0 ? 2 : i * 60 * 13),
  opens: 40 - i * 3,
  platform: i % 4 === 3 ? "web" : "android",
  app_version: i % 4 === 3 ? "web" : ["2.0.131", "2.0.128", "2.0.120"][i % 3],
  channel: "stable",
  camu: i % 3 !== 2,
  lms: i % 2 === 0,
  notifications: i % 5 === 4 ? "denied" : "granted",
  push: i % 5 !== 4,
  friends: (i * 3) % 7,
  reports: i === 1 ? 2 : 0,
  banned: i === 8,
  ban_reason: i === 8 ? "Spamming groups" : null,
  ban_until: null,
}));
const detail = (id) => {
  const u = users.find((x) => x.id === id) ?? users[0];
  return {
    user: { id: u.id, username: u.username, created_at: u.created_at, last_sign_in_at: t(30) },
    profile: { name: u.name, code: u.code, branch: u.branch, year: u.year, section: u.section, bio: null, avatar: null },
    seen: { last_seen: u.last_seen, first_seen: u.created_at, opens: u.opens, platform: u.platform, app_version: u.app_version, channel: "stable", camu: u.camu, lms: u.lms, notifications: u.notifications },
    days: Array.from({ length: 35 }, (_, i) => day(i)).filter((_, i) => (i * 7) % 3 !== 0),
    phones: u.push ? [{ platform: "android", caps: "data1", updated_at: t(100) }] : [],
    messages: 418,
    messages_7d: 37,
    friends: u.friends,
    groups: 3,
    ban: u.banned ? { reason: u.ban_reason, until: null, banned_at: t(600) } : null,
    reports: u.reports ? [{ id: "r1", reason: "Abusive or bullying", excerpt: "tu pagal hai kya, kuch nahi aata tujhe", status: "open", created_at: t(90) }] : [],
    reported_others: 0,
    errors: 1,
  };
};
const reports = [
  { id: "r1", reason: "Abusive or bullying", excerpt: "tu pagal hai kya, kuch nahi aata tujhe 😂😂", thread: "g:x", message_id: "m1", status: "open", created_at: t(90), target: users[1].id, target_name: users[1].name, target_username: users[1].username, reporter: users[2].id, reporter_name: users[2].name, target_reports: 2, target_banned: false },
  { id: "r2", reason: "Spam or scam: sending the same link in every group", excerpt: "FREE NETFLIX 👉 bit.ly/xxxx join fast!!!", thread: "g:y", message_id: "m2", status: "open", created_at: t(300), target: users[8].id, target_name: users[8].name, target_username: users[8].username, reporter: users[3].id, reporter_name: users[3].name, target_reports: 1, target_banned: true },
];
const errors = [
  { message: "TypeError: Cannot read properties of undefined (reading 'periods')", n: 3, people: 2, last_at: t(40), source: "/timetable page-3f.js:1", version: "2.0.128" },
  { message: "QuotaExceededError: The quota has been exceeded.", n: 1, people: 1, last_at: t(600), source: "/ promise", version: "web" },
];
const broadcasts = [
  { id: "b1", title: "Exams are close 📚", body: "Check your timetable and pending tasks in DockIn.", path: "/", audience: { kind: "all" }, sent_at: t(60 * 26), people: 160, phones: 171, delivered: 168 },
];
const audit = [
  { at: t(30), action: "ban", target: users[8].id, detail: { reason: "Spamming groups" }, admin_name: "sachin" },
  { at: t(60 * 26), action: "notify", target: null, detail: { title: "Exams are close 📚", people: 160 }, admin_name: "sachin" },
  { at: t(60 * 50), action: "announcement.set", target: null, detail: {}, admin_name: "sachin" },
];

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

async function open({ role = "owner", signedIn = true, viewport = { width: 1440, height: 900 }, theme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 2 : 1 });
  const page = await ctx.newPage();
  const calls = { push: [], ban: [], rpc: [] };
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  await page.route(`https://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.startsWith("/auth/v1/user")) return json(user);
    if (url.pathname.startsWith("/auth/v1/")) return json({});
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
    if (m) {
      const args = JSON.parse(req.postData() || "{}");
      calls.rpc.push([m[1], args]);
      switch (m[1]) {
        case "admin_role":
          return json(role);
        case "admin_overview":
          return json(overview);
        case "admin_users": {
          let rows = users;
          if (args.p_q) rows = rows.filter((u) => (u.name + u.username).toLowerCase().includes(args.p_q.toLowerCase()));
          if (args.p_filter === "no_camu") rows = rows.filter((u) => !u.camu);
          if (args.p_filter === "banned") rows = rows.filter((u) => u.banned);
          return json({ total: rows.length, rows });
        }
        case "admin_user":
          return json(detail(args.p_id));
        case "admin_reports":
          return json(args.p_status === "open" ? reports : []);
        case "admin_resolve_report":
          return json(null);
        case "admin_errors":
          return json(errors);
        case "admin_broadcasts":
          return json(broadcasts);
        case "admin_audit_log":
          return json(audit);
        case "admin_team":
          return json([{ user_id: ME, role: "owner", username: "sachin", name: "Sachin Kumar", added_at: t(99999) }]);
        case "admin_set_announcement":
          return json(null);
        default:
          return json(null);
      }
    }
    if (url.pathname.startsWith("/rest/v1/app_config")) {
      const one = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      const row = { value: { id: "a1", text: "Mid-sem timetable is in — check Timetable 📅", tone: "info" } };
      return one ? json(row) : json([row]);
    }
    return json([]);
  });
  await page.route("**/api/admin/push", async (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    calls.push.push(b);
    const reach = b.audience?.kind === "inactive" ? { people: 31, phones: 33 } : b.audience?.kind === "me" ? { people: 1, phones: 1 } : { people: 160, phones: 171 };
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b.dryRun ? reach : { ok: true, ...reach, sent: reach.phones - 1, failed: 1 }) });
  });
  await page.route("**/api/admin/ban", async (r) => {
    calls.ban.push(JSON.parse(r.request().postData() || "{}"));
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, until: null }) });
  });
  await page.route("**/api/admin/github", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ releases: [{ tag: "apk-latest", name: "DockIn for Android", published: t(60 * 20), downloads: 57 }, { tag: "apk-v3-preview", name: "DockIn 3 preview (test build)", published: t(60 * 3), downloads: 2 }] }) }),
  );
  await page.route("**/api/assistant", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.addInitScript(
    ([ref, value, theme]) => {
      try {
        if (value) localStorage.setItem(`sb-${ref}-auth-token`, value);
        localStorage.setItem("dockin-admin-theme", theme);
      } catch {}
    },
    [REF, signedIn ? JSON.stringify(session) : "", theme],
  );
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  return { ctx, page, calls };
}

{
  const { ctx, page } = await open({ signedIn: false });
  await step("signed out: the admin sign-in", async () => {
    await page.getByText("For the DockIn team only").waitFor({ timeout: 8000 });
    await page.screenshot({ path: `${SHOTS}/admin-signin.png` });
  });
  await ctx.close();
}
{
  const { ctx, page } = await open({ role: null });
  await step("a student account is turned away", async () => {
    await page.getByText("Not an admin account").waitFor({ timeout: 8000 });
  });
  await ctx.close();
}

{
  const { ctx, page, calls } = await open();
  await step("laptop: overview with numbers, chart, funnel, versions", async () => {
    await page.getByRole("heading", { name: "Overview" }).waitFor({ timeout: 8000 });
    await page.getByText("214").first().waitFor({ timeout: 6000 });
    await page.getByText("Setup funnel").waitFor();
    await page.waitForTimeout(900);
    const wide = await page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > W + 1 && r.width > 0) out.push(`${el.tagName}.${String(el.className?.baseVal ?? el.className).slice(0, 50)} ${Math.round(r.right)}`);
      }
      return { sw: document.documentElement.scrollWidth, W, out: out.slice(0, 6) };
    });
    if (wide.sw > wide.W) throw new Error(`scrolls sideways: ${JSON.stringify(wide)}`);
    await page.screenshot({ path: `${SHOTS}/admin-overview.png`, fullPage: true });
  });

  await step("funnel → students who haven't connected Camu", async () => {
    await page.getByRole("button", { name: /haven't connected Camu/ }).click();
    await page.getByRole("heading", { name: "Students" }).waitFor({ timeout: 4000 });
    await page.getByRole("button", { name: "No Camu" }).waitFor();
    const last = calls.rpc.filter(([f]) => f === "admin_users").pop();
    if (last?.[1].p_filter !== "no_camu") throw new Error(`filter was ${last?.[1].p_filter}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/admin-users.png` });
  });

  await step("one student: activity, setup, reports — and suspend", async () => {
    await page.getByRole("button", { name: "Everyone" }).click();
    await page.getByText("Yash Raj").first().click();
    const drawer = page.getByRole("dialog", { name: "Student" });
    await drawer.getByText("Active days (last 5 weeks)").waitFor({ timeout: 4000 });
    await drawer.getByText(/Reported 1 time/).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/admin-user.png` });
    await drawer.getByRole("button", { name: "Suspend", exact: true }).click();
    await drawer.getByPlaceholder("Reason (they will see this)").fill("Abusing people in groups");
    await drawer.getByRole("button", { name: "Suspend now" }).click();
    await page.waitForTimeout(500);
    const b = calls.ban[0];
    if (!b || b.reason !== "Abusing people in groups" || b.days !== 7) throw new Error(JSON.stringify(b));
    await page.keyboard.press("Escape");
  });

  await step("notify: write, pick 'Gone quiet', see the reach, send", async () => {
    await page.getByRole("button", { name: /Notify/ }).first().click();
    await page.getByRole("heading", { name: "Notifications" }).waitFor({ timeout: 4000 });
    await page.getByPlaceholder("e.g. Exams are close 📚").fill("We miss you 👋");
    await page.getByPlaceholder("What should they know?").fill("Your attendance is waiting — open DockIn to see what you can skip.");
    await page.getByRole("button", { name: /Gone quiet/ }).click();
    await page.getByText(/Reaches 31 students on 33 phones/).waitFor({ timeout: 4000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/admin-notify.png`, fullPage: true });
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByRole("button", { name: "Yes, send" }).click();
    await page.waitForTimeout(600);
    const sent = calls.push.find((p) => !p.dryRun);
    if (!sent || sent.audience.kind !== "inactive" || sent.audience.days !== 7 || sent.title !== "We miss you 👋") throw new Error(JSON.stringify(sent));
  });

  await step("reports: see the message, remove it", async () => {
    await page.getByRole("button", { name: /Reports/ }).first().click();
    await page.getByText("tu pagal hai kya", { exact: false }).first().waitFor({ timeout: 4000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/admin-reports.png` });
    await page.getByRole("button", { name: "Remove" }).first().click();
    await page.waitForTimeout(400);
    if (!calls.rpc.some(([f, a]) => f === "admin_resolve_report" && a.p_action === "delete_message")) throw new Error("not resolved");
  });

  await step("health and settings", async () => {
    await page.getByRole("button", { name: /Health/ }).first().click();
    await page.getByText("What broke").waitFor({ timeout: 4000 });
    await page.getByText("Demo mode (no API key yet)").waitFor({ timeout: 4000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/admin-health.png`, fullPage: true });
    await page.getByRole("button", { name: /Settings/ }).first().click();
    await page.getByText("Announcement banner").waitFor({ timeout: 4000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/admin-settings.png` });
  });
  await ctx.close();
}

{
  const { ctx, page } = await open({ theme: "dark" });
  await step("dark mode", async () => {
    await page.getByText("Setup funnel").waitFor({ timeout: 8000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/admin-overview-dark.png` });
  });
  await ctx.close();
}

{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 } });
  await step("phone: overview, students and the bottom bar", async () => {
    await page.getByText("Setup funnel").waitFor({ timeout: 8000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/admin-phone-overview.png` });
    await page.getByRole("navigation", { name: "Admin" }).getByRole("button", { name: /Students/ }).click();
    await page.getByRole("button", { name: /Harshit Jain/ }).waitFor({ timeout: 4000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/admin-phone-users.png` });
  });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : `\nDockIn Admin works (${ok} checks).`);
process.exit(problems.length ? 1 : 0);
