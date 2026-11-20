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
import { mkdirSync, readFileSync } from "node:fs";

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
  { id: "m7", thread: `g:${G}`, author: YASH, body: "", kind: "file", data: { name: "Assignment4_Vaibhav.pdf", size: 61000, type: "application/pdf", path: "g/sol/Assignment4_Vaibhav.pdf", solution: { instance: 41, title: "DBMS Assignment 4", course: "Database Management Systems", dueDate: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10), dueTime: "23:59", authorName: "Vaibhav Sharma", authorRoll: "S25CSEU0155" } }, reply_to: null, created_at: t(10), deleted_at: null },
  { id: "m8", thread: `g:${G}`, author: YASH, body: "", kind: "file", data: { name: "Solution_Practice.pdf", size: 61000, type: "application/pdf", path: "g/sol/Solution_Practice.pdf", solution: { instance: 900101, title: "DBMS Assignment 4 (practice)", course: "Database Management Systems", dueDate: null, dueTime: null, authorName: "Vaibhav Sharma", authorRoll: "S25CSEU0155" } }, reply_to: null, created_at: t(5), deleted_at: null },
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
  if (url.pathname.startsWith("/storage/v1/object/")) {
    if (req.method() === "GET") return route.fulfill({ status: 200, contentType: "application/pdf", body: readFileSync(new URL("../tests/fixtures/solution-chrome.pdf", import.meta.url)) });
    return json({ Key: url.pathname.split("/object/")[1], Id: "x" });
  }
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
      const tx = r.result.transaction(["profile", "tasks"], "readwrite");
      tx.objectStore("profile").put({ id: "me", name: "Sachin", target: 75, theme: "light", onboarded: true, createdAt: 0, updatedAt: Date.now() });
      const due = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
      tx.objectStore("tasks").put({ id: "lms-assign-41", title: "DBMS Assignment 4", notes: "Database Management Systems", kind: "assignment", subjectId: null, dueDate: due, dueTime: "23:59", room: "", priority: "normal", done: false, doneAt: null, subtasks: [], source: "lms", url: "https://lms.example/mod/assign/view.php?id=41", createdAt: 0, updatedAt: Date.now(), deletedAt: null });
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
  // a photo goes through the cropper first
  const png = Buffer.from(
    "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",
    "base64",
  );
  await flow.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await page.getByRole("dialog", { name: "Crop photo" }).waitFor({ timeout: 4000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/crop.png` });
  await page.getByRole("button", { name: "Use photo" }).click();
  await page.getByRole("dialog", { name: "Crop photo" }).waitFor({ state: "detached", timeout: 4000 });
  await flow.getByRole("button", { name: "Remove photo" }).waitFor({ timeout: 3000 });
  await flow.getByRole("button", { name: "Remove photo" }).click();
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
  const sheet = page.getByRole("dialog", { name: "Customise chat" });
  await sheet.getByRole("button", { name: "Night", exact: true }).click();
  await sheet.getByRole("button", { name: "Waves", exact: true }).click();
  await sheet.getByLabel("Accent #5eb5f7").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/chat-theme-sheet.png` });
  await sheet.getByRole("button", { name: "Bubbles", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/chat-theme-sheet2.png` });
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

await step("a friend's solution: card, my name in, animation, check", async () => {
  await page.getByRole("button", { name: /CSE E1/ }).first().click();
  const chat = page.getByRole("dialog").first();
  await chat.getByText("Assignment solution").first().waitFor({ timeout: 4000 });
  await chat.getByText("You haven't submitted yet").first().waitFor({ timeout: 3000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/solution-card.png` });
  await chat.getByRole("button", { name: /Edit & submit/ }).first().click();
  const studio = page.getByRole("dialog", { name: "Make my copy" });
  await studio.getByText("Names in the file").waitFor({ timeout: 10000 });
  await studio.getByText("Vaibhav Sharma", { exact: true }).waitFor({ timeout: 2000 });
  await studio.getByText("DBMS Assignment 4").first().waitFor({ timeout: 2000 });
  const make = studio.getByRole("button", { name: /Make my copy/ });
  if (!(await make.isDisabled())) throw new Error("should ask for my enrollment first");
  await studio.getByPlaceholder("Your enrollment no.").fill("e23cseu0155");
  await page.screenshot({ path: `${SHOTS}/solution-setup.png` });
  await make.click();
  await page.waitForTimeout(1900);
  await page.screenshot({ path: `${SHOTS}/solution-working.png` });
  const check = page.getByRole("dialog", { name: "Check your copy" });
  await check.getByText(/places changed/).waitFor({ timeout: 15000 });
  await check.getByText("Their name is gone").waitFor({ timeout: 2000 });
  await check.getByText("Submitting works in the DockIn app", { exact: false }).waitFor({ timeout: 2000 });
  await page.screenshot({ path: `${SHOTS}/solution-preview.png` });
  await check.getByLabel("Close").click();
  await page.waitForTimeout(300);
  if (await page.getByRole("dialog", { name: /Check your copy|Make my copy/ }).count()) throw new Error("studio did not close");
  // Asked once: the enrollment is remembered for next time.
  await chat.getByRole("button", { name: /Edit & submit/ }).first().click();
  await page.getByRole("dialog", { name: "Make my copy" }).getByText("Names in the file").waitFor({ timeout: 10000 });
  const roll = await page.getByPlaceholder("Your enrollment no.").inputValue();
  if (roll !== "E23CSEU0155") throw new Error(`enrollment not remembered: "${roll}"`);
  await page.goBack();
  await page.waitForTimeout(400);
  if (await page.getByRole("dialog", { name: "Make my copy" }).count()) throw new Error("Back did not close the studio");
});

await step("sending a PDF asks: just a file, or a solution for which assignment", async () => {
  const chat = page.getByRole("dialog").first();
  await chat.locator('input[type="file"]').first().setInputFiles({ name: "OS_Lab3_Sachin.pdf", mimeType: "application/pdf", buffer: readFileSync(new URL("../tests/fixtures/solution-chrome.pdf", import.meta.url)) });
  const ask = page.getByRole("dialog", { name: "Send this file" });
  await ask.getByText("Solution for an LMS assignment").click();
  await page.getByRole("dialog", { name: "Which assignment?" }).getByText("DBMS Assignment 4").click();
  const who = page.getByRole("dialog", { name: "Your details in it" });
  await who.getByText("found 1×").first().waitFor({ timeout: 8000 }).catch(() => {});
  await who.getByLabel("Your name").fill("Vaibhav Sharma");
  await who.getByText(/found \d+×/).first().waitFor({ timeout: 3000 });
  await page.screenshot({ path: `${SHOTS}/solution-send.png` });
  await who.getByRole("button", { name: /Send solution/ }).click();
  await chat.getByText("Friends can put their own name on it", { exact: false }).waitFor({ timeout: 6000 });
  const sent = messages.find((m) => m.data?.solution && m.author === ME);
  if (!sent || sent.data.solution.instance !== 41 || sent.data.solution.authorName !== "Vaibhav Sharma") throw new Error("solution data not sent: " + JSON.stringify(sent?.data));
  await page.screenshot({ path: `${SHOTS}/solution-sent.png` });
  await page.goBack();
  await page.waitForTimeout(400);
});

await step("Practice LMS: switch on, submit a friend's solution, see the file", async () => {
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Practice LMS/ }).click();
  const sheet = page.getByRole("dialog", { name: "Practice LMS" });
  await sheet.getByRole("button", { name: /Practice LMS\s*Off/ }).click();
  await sheet.getByText("DBMS Assignment 4 (practice)").waitFor({ timeout: 4000 });
  await page.screenshot({ path: `${SHOTS}/practice-on.png` });
  await page.goto(`${BASE}/circle`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /CSE E1/ }).first().click();
  const chat = page.getByRole("dialog").first();
  const card = chat.locator("div", { hasText: "DBMS Assignment 4 (practice)" }).filter({ hasText: "Edit & submit" }).last();
  await card.getByText("You haven't submitted yet").waitFor({ timeout: 4000 });
  await card.getByRole("button", { name: /Edit & submit/ }).click();
  const studio = page.getByRole("dialog", { name: "Make my copy" });
  await studio.getByText("Names in the file").waitFor({ timeout: 10000 });
  await studio.getByRole("button", { name: /Make my copy/ }).click();
  const check = page.getByRole("dialog", { name: "Check your copy" });
  await check.getByText("Practice LMS — this stays on your phone").waitFor({ timeout: 15000 });
  await check.getByRole("button", { name: /Submit to Practice LMS/ }).click();
  const done = page.getByRole("dialog", { name: "Submitted" });
  await done.getByText("Submitted to Practice LMS").waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${SHOTS}/practice-done.png` });
  await done.getByRole("button", { name: "Done" }).click();
  await card.getByText("You've submitted this").waitFor({ timeout: 4000 });
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Practice LMS/ }).click();
  await page.getByRole("dialog", { name: "Practice LMS" }).getByText("Solution_Practice.pdf").waitFor({ timeout: 4000 });
  await page.screenshot({ path: `${SHOTS}/practice-kept.png` });
});

await browser.close();
if (problems.length) {
  console.log("\n" + problems.join("\n"));
  process.exit(1);
}
console.log("\nFriends and chat work signed in.");
