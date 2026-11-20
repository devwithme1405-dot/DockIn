/**
 * Friends + chat, signed in, against a fake Supabase.
 *
 * Plants a session, answers every Supabase REST call from a tiny in-memory
 * world (one friend, one group, a few messages), and walks: the Chats list,
 * a one-to-one chat (send a message), the group chat, and the QR sheet.
 * Needs a build made with NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY set (any values
 * for the project ref below), served on :3000.
 *
 *   node scripts/chat-check.mjs
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const REF = (process.env.SUPABASE_REF ?? "qfwldkdwxkqjmscttlza").trim();
const SHOTS = "/tmp/dockin-shots";
mkdirSync(SHOTS, { recursive: true });

const ME = "00000000-0000-4000-8000-000000000001";
const YASH = "00000000-0000-4000-8000-000000000002";
const RIYA = "00000000-0000-4000-8000-000000000003";
const G = "00000000-0000-4000-8000-0000000000aa";
const dm = `d:${[ME, YASH].sort().join(":")}`;
const t = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString();

const user = { id: ME, aud: "authenticated", role: "authenticated", email: "sachin@dockin.app", app_metadata: {}, user_metadata: {}, created_at: t(9999) };
const session = { access_token: "fake", refresh_token: "fake", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };

const messages = [
  { id: "m1", thread: dm, author: YASH, body: "Bhai DBMS lab 7 kiya?", kind: "text", data: null, reply_to: null, created_at: t(50), deleted_at: null },
  { id: "m2", thread: dm, author: ME, body: "Haan, joins wala. Shaam tak bhejta hoon", kind: "text", data: null, reply_to: null, created_at: t(45), deleted_at: null },
  { id: "m3", thread: `g:${G}`, author: RIYA, body: "", kind: "task", data: { title: "Lab 7: Joins", kind: "assignment", dueDate: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10), dueTime: "23:59", subject: "Database Management Systems" }, reply_to: null, created_at: t(30), deleted_at: null },
  { id: "m4", thread: `g:${G}`, author: YASH, body: "Thanks Riya 🙏", kind: "text", data: null, reply_to: null, created_at: t(20), deleted_at: null },
  { id: "m5", thread: `g:${G}`, author: RIYA, body: "", kind: "poll", data: { question: "Kal DBMS class chal rahe?", options: ["Haan", "Nahi", "Proxy laga do"] }, reply_to: null, created_at: t(15), deleted_at: null },
  { id: "m6", thread: dm, author: YASH, body: "", kind: "file", data: { name: "DBMS_Lab7_question.pdf", size: 182000, type: "application/pdf", path: "x/y/DBMS_Lab7_question.pdf" }, reply_to: null, created_at: t(40), deleted_at: null },
];
const votes = [{ message_id: "m5", user_id: YASH, choice: 0 }];

const tables = {
  messages,
  thread_reads: [],
  profiles: [
    { user_id: ME, name: "Sachin", avatar: null, code: "SACH1234" },
    { user_id: YASH, name: "Yash", avatar: null },
    { user_id: RIYA, name: "Riya Sharma", avatar: null },
  ],
  groups: [{ id: G, name: "CSE E1", emoji: "📚", code: "ABC234", owner: ME, updated_at: 0 }],
  group_members: [
    { group_id: G, user_id: ME },
    { group_id: G, user_id: YASH },
    { group_id: G, user_id: RIYA },
  ],
  shares: [],
  share_reactions: [],
  poll_votes: votes,
  blocks: [],
  friend_stats: [],
};
{
  const due = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  const day = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const today = day(0);
  tables.friend_stats.push({
    user_id: YASH,
    updated_at: new Date().toISOString(),
    data: {
      v: 1,
      at: Date.now(),
      target: 75,
      attendance: {
        present: 61,
        total: 78,
        subjects: [
          { key: "a", name: "Database Management Systems", code: "CSET207", present: 20, total: 24 },
          { key: "b", name: "Operating Systems", code: "CSET209", present: 15, total: 21 },
          { key: "c", name: "Discrete Maths", code: "MATH201", present: 26, total: 33 },
        ],
      },
      days: { [day(1)]: [0, 1, 2], [day(2)]: [0, 2], [day(3)]: [1, 1, 2] },
      today: { date: today, classes: [{ from: "00:00", to: "00:30", name: "DBMS" }, { from: "23:00", to: "23:50", name: "OS" }] },
      tasks: {
        pending: 3,
        overdue: 1,
        dueThisWeek: 2,
        doneThisWeek: 4,
        lmsPending: 1,
        next: { title: "OS assignment 3", due },
        shared: [{ origin: `${RIYA}:lab 7: joins:${due}`, title: "Lab 7: Joins", due, done: true }],
      },
    },
  });
}
const rpcs = {
  my_people: [
    { user_id: YASH, name: "Yash", avatar: null, branch: "CSE", year: 2, section: "E1", bio: null, attendance_state: "safe", friend_status: "accepted", requested_by: ME, requested_at: Date.now() - 3 * 86400_000, since: Date.now() - 2 * 86400_000 },
    { user_id: "00000000-0000-4000-8000-000000000004", name: "Aman Verma", avatar: null, branch: "CSE", year: 2, section: "E2", bio: null, attendance_state: null, friend_status: "pending", requested_by: "00000000-0000-4000-8000-000000000004", requested_at: Date.now() - 3600_000 },
  ],
  ensure_profile: [{ user_id: ME, code: "SACH1234", name: "Sachin", avatar: null, branch: null, year: 2, section: "E1", bio: null, attendance_state: null, share_attendance: false }],
};

const problems = [];
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));

await page.route(`https://${REF}.supabase.co/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (url.pathname.startsWith("/auth/v1/user")) return json(user);
  if (url.pathname.startsWith("/auth/v1/")) return json({});
  const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)/);
  if (!m) return json([]);
  const [, isRpc, name] = m;
  if (isRpc && name === "create_group") {
    const b = JSON.parse(req.postData() || "{}");
    const g = { id: "00000000-0000-4000-8000-0000000000a1", name: b.group_name, emoji: b.group_emoji, code: "NEW234", owner: ME, updated_at: Date.now() };
    tables.groups.push(g);
    tables.group_members.push({ group_id: g.id, user_id: ME });
    return json(g);
  }
  if (isRpc && name === "add_group_members") {
    const b = JSON.parse(req.postData() || "{}");
    for (const p of b.people) tables.group_members.push({ group_id: b.gid, user_id: p });
    return json(b.people.length);
  }
  if (isRpc) return json(rpcs[name] ?? []);
  if (req.method() === "POST" && name === "messages") {
    const body = JSON.parse(req.postData() || "{}");
    const row = { author: ME, created_at: new Date().toISOString(), deleted_at: null, data: null, reply_to: null, ...body };
    messages.push(row);
    const one = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    return json(one ? row : [row], 201);
  }
  if (name === "poll_votes" && req.method() === "POST") {
    const b = JSON.parse(req.postData() || "{}");
    const i = votes.findIndex((v) => v.message_id === b.message_id && v.user_id === b.user_id);
    if (i >= 0) votes[i] = b;
    else votes.push(b);
    return json([b], 201);
  }
  if (req.method() !== "GET") return json([], 200);
  return json(tables[name] ?? []);
});
await page.route("**/api/push", (r) => r.fulfill({ status: 503, body: "{}" }));

await page.addInitScript(
  ([ref, value]) => {
    try {
      localStorage.setItem(`sb-${ref}-auth-token`, value);
    } catch {}
  },
  [REF, JSON.stringify(session)],
);

// Seed a finished onboarding so the shell lets us in.
await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  await new Promise((res) => {
    const r = indexedDB.open("dockin");
    r.onsuccess = () => {
      const tx = r.result.transaction(["profile"], "readwrite");
      tx.objectStore("profile").put({ id: "me", name: "Sachin", target: 75, theme: "light", onboarded: true, createdAt: 0, updatedAt: Date.now() });
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    };
    r.onerror = () => res();
  });
  localStorage.setItem("dockin-setup-v1", "1");
});

async function step(name, fn) {
  const before = problems.length;
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${e.message.split("\n")[0]} (at ${page.url()})`);
    await page.screenshot({ path: `${SHOTS}/chat-fail-${name.slice(0, 12).replace(/\W+/g, "-")}.png` }).catch(() => {});
  }
  console.log(`${problems.length === before ? "ok  " : "FAIL"} ${name}`);
}

await step("the Chats list shows the friend and the group, with unread", async () => {
  await page.goto(`${BASE}/circle`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Yash/ }).first().waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: /CSE E1/ }).first().waitFor({ timeout: 4000 });
  await page.screenshot({ path: `${SHOTS}/chat-list.png` });
});

await step("a one-to-one chat opens and sends", async () => {
  await page.getByRole("button", { name: /Yash.*(You:|Bhai|DBMS_)/ }).first().click();
  await page.getByRole("dialog").getByText("Bhai DBMS lab 7 kiya?").waitFor({ timeout: 4000 });
  await page.getByLabel("Message", { exact: true }).fill("Bhej diya 👍");
  await page.getByLabel("Send").click();
  await page.getByRole("dialog").getByText("Bhej diya 👍").waitFor({ timeout: 4000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/chat-dm.png` });
  await page.getByRole("dialog").getByLabel("Back").click();
  await page.waitForTimeout(400);
  if (new URL(page.url()).searchParams.get("chat")) throw new Error("back did not close the chat");
});

await step("the group chat shows who said what and the task card", async () => {
  await page.getByRole("button", { name: /CSE E1/ }).first().click();
  await page.getByRole("dialog").getByText("Lab 7: Joins").waitFor({ timeout: 4000 });
  await page.getByRole("dialog").getByText("Riya Sharma").first().waitFor({ timeout: 2000 });
  await page.screenshot({ path: `${SHOTS}/chat-group.png` });
  await page.getByRole("dialog").getByLabel("Back").click();
});

await step("friend requests show on the Chats tab with accept, reject and block", async () => {
  await page.getByLabel("Friend requests").first().click();
  await page.getByRole("button", { name: "Reject", exact: true }).waitFor({ timeout: 3000 });
  await page.getByLabel("Block Aman Verma").waitFor({ timeout: 2000 });
  await page.screenshot({ path: `${SHOTS}/chat-requests.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await step("a group poll takes a vote, and the chat can be pinned", async () => {
  await page.getByRole("button", { name: /CSE E1/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("Kal DBMS class chal rahe?").waitFor({ timeout: 4000 });
  await dlg.getByRole("button", { name: /Nahi/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/chat-poll.png` });
  await dlg.getByLabel("CSE E1 info").click();
  await page.getByRole("dialog", { name: "CSE E1 info" }).getByRole("button", { name: /Pin chat/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/chat-info.png` });
  await page.getByRole("dialog", { name: "CSE E1 info" }).getByLabel("Back").click();
  await page.waitForTimeout(300);
  await dlg.getByLabel("Back").click();
  await page.getByLabel("Pinned").first().waitFor({ timeout: 3000 });
});

await step("the + menu offers task, poll and document; a document shows as a card", async () => {
  await page.getByRole("button", { name: /Yash.*(You:|Bhai|DBMS_)/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("DBMS_Lab7_question.pdf").waitFor({ timeout: 4000 });
  await dlg.getByLabel("Add a task, poll or document").click();
  await page.getByRole("button", { name: "Document", exact: true }).waitFor({ timeout: 2000 });
  await page.screenshot({ path: `${SHOTS}/chat-plus.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await dlg.getByLabel("Back").click();
});

await step("Task in chat can make a brand-new task", async () => {
  await page.getByRole("button", { name: /Yash.*(You:|Bhai|DBMS_)/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Add a task, poll or document").click();
  await page.getByRole("button", { name: "Task", exact: true }).click();
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByPlaceholder("What needs to be done?").fill("OS viva prep");
  await page.getByRole("button", { name: /Add to my Tasks & send/ }).click();
  await dlg.getByText("OS viva prep").waitFor({ timeout: 4000 });
  await dlg.getByText("In your Tasks").first().waitFor({ timeout: 3000 });
  await page.screenshot({ path: `${SHOTS}/chat-newtask.png` });
  await page.waitForTimeout(600);
  await page.getByLabel("Back", { exact: true }).click();
  await page.getByLabel("Scan a QR").waitFor({ timeout: 3000 });
  await page.waitForTimeout(300);
});

await step("long-press a chat to select, then mute it", async () => {
  const rowBtn = page.getByRole("button", { name: /Yash.*(You:|Bhai|DBMS_|OS viva)/ }).first();
  const box = await rowBtn.boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.getByLabel("Select all").waitFor({ timeout: 2000 });
  await page.screenshot({ path: `${SHOTS}/chat-select.png` });
  await page.getByLabel("Mute", { exact: true }).click();
  await page.getByLabel("Muted").first().waitFor({ timeout: 3000 });
});

await step("Add a friend offers scan and my QR", async () => {
  await page.getByRole("button", { name: "Add Friend", exact: true }).first().click();
  await page.getByRole("button", { name: /Scan their QR/ }).waitFor({ timeout: 3000 });
  await page.getByRole("button", { name: /Show my QR/ }).waitFor({ timeout: 2000 });
  await page.screenshot({ path: `${SHOTS}/chat-add.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await step("Friends panel: friends, requests and the activity history", async () => {
  await page.getByRole("button", { name: "Friends", exact: true }).first().click();
  const panel = page.getByRole("dialog", { name: "Friends" });
  await panel.getByRole("button", { name: /Requests/ }).waitFor({ timeout: 3000 });
  await panel.getByText("Aman Verma").first().waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/chat-friends-requests.png` });
  await panel.getByRole("button", { name: "Friends", exact: true }).click();
  await panel.getByText(/Friends since/).waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/chat-friends-panel.png` });
  await panel.getByRole("button", { name: "Activity", exact: true }).click();
  await panel.getByText("accepted your friend request").waitFor({ timeout: 3000 });
  await panel.getByText("wants to be your friend").waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/chat-friends-activity.png` });
  await page.goBack();
  await page.waitForTimeout(400);
  if (await page.getByRole("dialog", { name: "Friends" }).count()) throw new Error("Back did not close the Friends panel");
});

await step("New group: name, photo/emoji, description, then pick people", async () => {
  await page.getByRole("button", { name: "New Group", exact: true }).first().click();
  const flow = page.getByRole("dialog", { name: "New group" });
  await flow.getByPlaceholder(/CSE E2/).fill("Study Squad");
  await flow.getByLabel("Use 🚀").click();
  await flow.getByPlaceholder(/What's this group for/).fill("DBMS prep");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/chat-newgroup-1.png` });
  await flow.getByRole("button", { name: /Next: add people/ }).click();
  await flow.getByRole("button", { name: /Yash/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/chat-newgroup-2.png` });
  await page.goBack(); // back to step 1, not out
  await flow.getByPlaceholder(/CSE E2/).waitFor({ timeout: 2000 });
  await flow.getByRole("button", { name: /Next: add people/ }).click();
  await flow.getByRole("button", { name: /Create with 1/ }).click();
  await page.getByRole("dialog", { name: "Chat with Study Squad" }).waitFor({ timeout: 5000 });
  await page.getByLabel("Back", { exact: true }).click();
  await page.waitForTimeout(400);
  if (new URL(page.url()).pathname !== "/circle") throw new Error("left Friends: " + page.url());
});

await step("chat themes, jumbo emoji, links and starring", async () => {
  await page.getByRole("button", { name: /Yash.*(You:|Bhai|DBMS_|OS viva)/ }).first().click();
  const chat = page.getByRole("dialog", { name: /Chat with/ });
  await chat.getByLabel("Message", { exact: true }).fill("😂🔥");
  await chat.getByLabel("Send", { exact: true }).click();
  await chat.getByLabel("Message", { exact: true }).fill("notes yaha hai https://example.com/dbms dekh le");
  await chat.getByLabel("Send", { exact: true }).click();
  await chat.getByRole("link", { name: /example\.com/ }).waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/chat-mint.png` });
  await chat.getByLabel("Chat menu").click();
  await page.getByRole("button", { name: /Chat theme & wallpaper/ }).click();
  const sheet = page.getByRole("dialog", { name: "Chat theme" });
  await sheet.getByRole("button", { name: "Night" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/chat-theme-sheet.png` });
  await sheet.getByLabel("Close").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/chat-night.png` });
  // star a message from the hold menu, then find it under Starred
  const bubble = chat.getByText("Bhai DBMS lab 7 kiya?");
  const box = await bubble.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.getByRole("button", { name: "Star", exact: true }).click();
  await chat.getByLabel("Chat menu").click();
  await page.getByRole("button", { name: /Starred messages \(1\)/ }).click();
  await page.getByRole("dialog", { name: "Starred messages" }).getByText("Bhai DBMS lab 7 kiya?").waitFor({ timeout: 2000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // back to the default look for the rest of the run
  await page.evaluate(() => localStorage.removeItem("dockin-chat-look"));
  await page.getByLabel("Back", { exact: true }).click();
  await page.waitForTimeout(400);
});

await step("Compare: attendance board, shared tasks, trip planner, free now", async () => {
  await page.getByRole("button", { name: /Compare with friends/ }).click();
  const panel = page.getByRole("dialog", { name: "Compare" });
  await panel.getByText("Share your numbers to compare").waitFor({ timeout: 3000 });
  await panel.getByRole("switch", { name: "Attendance" }).click();
  await panel.getByRole("switch", { name: "Tasks & deadlines" }).click();
  await panel.getByRole("switch", { name: "Timetable" }).click();
  await panel.getByText("78.2%").first().waitFor({ timeout: 3000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/compare-attendance.png` });
  await panel.getByRole("button", { name: /Tasks/ }).first().click();
  await panel.getByText("Lab 7: Joins").first().waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/compare-tasks.png` });
  await panel.getByRole("button", { name: /Trip/ }).click();
  await panel.getByRole("button", { name: "Next 3 days" }).click();
  await panel.getByText(/Misses \d+ class/).first().waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/compare-trip.png` });
  await panel.getByRole("button", { name: /Free now/ }).click();
  await panel.getByText("Everyone free together").waitFor({ timeout: 3000 });
  await page.screenshot({ path: `${SHOTS}/compare-free.png` });
  await page.goBack();
  await page.waitForTimeout(400);
  if (await page.getByRole("dialog", { name: "Compare" }).count()) throw new Error("Back did not close Compare");
});

await step("the scanner opens smoothly and can flip to My QR", async () => {
  await page.getByLabel("Scan a QR").click();
  await page.getByText("Point at a friend").waitFor({ timeout: 6000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/chat-scanner.png` });
  await page.getByRole("dialog", { name: "Scan a QR code" }).getByRole("button", { name: "My QR" }).click();
  await page.getByText("Let your friend scan this").waitFor({ timeout: 3000 });
  await page.screenshot({ path: `${SHOTS}/chat-scanner-mine.png` });
  await page.getByLabel("Close the scanner").click();
});

await step("your QR is there to be scanned", async () => {
  await page.getByRole("button", { name: "My QR", exact: true }).first().click();
  await page.getByText("SACH1234").waitFor({ timeout: 4000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/chat-myqr.png` });
});

await step("Back closes My QR and stays on Friends (not Today)", async () => {
  await page.goBack();
  await page.waitForTimeout(500);
  if (await page.getByRole("dialog", { name: "My QR" }).count()) throw new Error("My QR still open after Back");
  if (new URL(page.url()).pathname !== "/circle") throw new Error("left Friends: " + page.url());
  // and again: a sheet, then Back, then the same sheet opens fresh
  await page.getByRole("button", { name: "My QR", exact: true }).first().click();
  await page.getByText("SACH1234").waitFor({ timeout: 3000 });
  await page.getByRole("dialog", { name: "My QR" }).getByLabel("Close").click();
  await page.waitForTimeout(400);
  if (new URL(page.url()).pathname !== "/circle") throw new Error("close moved away: " + page.url());
  await page.getByRole("button", { name: "Add Friend", exact: true }).first().click();
  await page.getByRole("button", { name: /Show my QR/ }).click();
  await page.getByText("SACH1234").waitFor({ timeout: 3000 });
  await page.goBack();
  await page.waitForTimeout(500);
  if (await page.getByRole("dialog").count()) throw new Error("a sheet is still open after Back");
  if (new URL(page.url()).pathname !== "/circle") throw new Error("left Friends after sheet→sheet: " + page.url());
});

await step("Back from a chat returns to the list", async () => {
  await page.getByRole("button", { name: /Yash.*(You:|Bhai|DBMS_|OS viva)/ }).first().click();
  await page.getByRole("dialog", { name: /Chat with/ }).waitFor({ timeout: 3000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/chat-bubbles.png` });
  await page.goBack();
  await page.waitForTimeout(500);
  if (await page.getByRole("dialog", { name: /Chat with/ }).count()) throw new Error("chat still open");
  if (new URL(page.url()).pathname !== "/circle") throw new Error("left Friends: " + page.url());
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/chat-friends-home.png` });
});

await browser.close();
if (problems.length) {
  console.log("\n" + problems.join("\n"));
  process.exit(1);
}
console.log("\nFriends and chat work signed in.");
