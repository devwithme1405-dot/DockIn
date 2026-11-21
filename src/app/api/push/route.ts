import { createSign } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Sends push notifications for social events.
 *
 * The caller proves who they are with their Supabase access token; everything
 * else — who is told, and what — is worked out here from the database with the
 * service role, after checking the caller really authored the thing. So a
 * phone can ask "tell people about my message", never "send this text to X".
 *
 * Needs two server env vars on Vercel: FIREBASE_SERVICE_ACCOUNT (the service
 * account JSON) and SUPABASE_SERVICE_ROLE_KEY. Without them it answers 503 and
 * the app carries on.
 */

export const runtime = "nodejs";

type Event =
  | { type: "test" }
  | { type: "message"; id: string }
  | { type: "share"; id: string }
  | { type: "friend"; to?: string; code?: string };
type Note = { title: string; body: string; path: string; tag: string };

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function account(): ServiceAccount | null {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    const a = JSON.parse(raw) as ServiceAccount;
    return a.project_id && a.client_email && a.private_key ? a : null;
  } catch {
    return null;
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

let cached: { token: string; until: number } | null = null;

/** A short-lived Google OAuth token for FCM, signed with the service account. */
async function googleToken(a: ServiceAccount): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: a.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${claim}`);
  const jwt = `${head}.${claim}.${b64url(signer.sign(a.private_key.replace(/\\n/g, "\n")))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

/** Happened just now. Some stamps come from the phone's own clock, which can drift, hence the slack. */
const fresh = (ms: number, windowMs = 10 * 60_000) => Number.isFinite(ms) && Math.abs(Date.now() - ms) < windowMs;

// A light per-person cap on this instance: plenty for real chatting, useless for
// a script trying to flood people. (Each server instance keeps its own count.)
const recent = new Map<string, number[]>();
function overLimit(me: string, perMinute = 40): boolean {
  const now = Date.now();
  const list = (recent.get(me) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  recent.set(me, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.length || now - v[v.length - 1] > 60_000) recent.delete(k);
  return list.length > perMinute;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function nameOf(sb: SupabaseClient, id: string): Promise<string> {
  const { data } = await sb.from("profiles").select("name").eq("user_id", id).maybeSingle();
  return (data?.name as string | undefined)?.trim() || "Someone";
}

async function groupMembers(sb: SupabaseClient, groupId: string): Promise<string[]> {
  const { data } = await sb.from("group_members").select("user_id").eq("group_id", groupId);
  return (data ?? []).map((r) => r.user_id as string);
}

/** Who to tell and what to say, or null when the caller may not do this. */
async function plan(sb: SupabaseClient, me: string, e: Exclude<Event, { type: "test" }>): Promise<{ to: string[]; note: Note } | null> {
  const who = await nameOf(sb, me);

  if (e.type === "message") {
    const { data: m } = await sb.from("messages").select("thread,author,body,kind,data,created_at").eq("id", e.id).maybeSingle();
    if (!m || m.author !== me) return null;
    // Only a message just sent: replaying an old id must not ring everyone again.
    if (!fresh(Date.parse(String(m.created_at)), 3 * 60_000)) return null;
    const thread = m.thread as string;
    const d = (m.data ?? {}) as { title?: string; question?: string; name?: string; solution?: { title?: string } };
    const sol = m.kind === "file" && d.solution?.title ? String(d.solution.title).slice(0, 80) : null;
    const text = sol
      ? `📝 Sent the solution for "${sol}" — tap to put your name on it and submit`
      : m.kind === "task"
        ? `📌 ${d.title ?? "Task"}`
        : m.kind === "poll"
          ? `📊 Poll: ${d.question ?? ""}`
          : m.kind === "file"
            ? `📄 ${d.name ?? "Document"}`
            : (m.body as string);
    const path = `/circle?chat=${encodeURIComponent(thread)}`;
    if (thread.startsWith("g:")) {
      const gid = thread.slice(2);
      const members = await groupMembers(sb, gid);
      if (!members.includes(me)) return null;
      const { data: g } = await sb.from("groups").select("name,emoji").eq("id", gid).maybeSingle();
      const title = `${g?.emoji ? `${g.emoji} ` : ""}${g?.name ?? "Group"}`;
      return { to: members.filter((u) => u !== me), note: { title, body: clip(`${who}: ${text}`, 180), path, tag: thread } };
    }
    const [, a, b] = thread.split(":");
    if (me !== a && me !== b) return null;
    return { to: [me === a ? b : a], note: { title: who, body: clip(text, 180), path, tag: thread } };
  }

  if (e.type === "share") {
    const { data: s } = await sb.from("shares").select("author,group_id,data,created_at").eq("id", e.id).maybeSingle();
    if (!s || s.author !== me) return null;
    if (!fresh(Number(s.created_at))) return null;
    const d = (s.data ?? {}) as { title?: string; kind?: string; dueDate?: string | null };
    let to: string[] = [];
    let where = "";
    if (s.group_id) {
      to = await groupMembers(sb, s.group_id as string);
      const { data: g } = await sb.from("groups").select("name").eq("id", s.group_id).maybeSingle();
      where = g?.name ? ` in ${g.name}` : "";
    } else {
      const { data: t } = await sb.from("share_targets").select("user_id").eq("share_id", e.id);
      to = (t ?? []).map((r) => r.user_id as string);
    }
    const due = d.dueDate ? ` · due ${d.dueDate.slice(8, 10)}/${d.dueDate.slice(5, 7)}` : "";
    return {
      to: to.filter((u) => u !== me),
      note: { title: `${who} added a ${d.kind ?? "task"}${where}`, body: clip(`${d.title ?? "New task"}${due}`, 180), path: "/circle?tab=work", tag: `share:${e.id}` },
    };
  }

  // A friend request (or the acceptance of one), by user id or by their code.
  let to = e.to ?? "";
  if (!to && e.code) {
    const { data: p } = await sb.from("profiles").select("user_id").eq("code", e.code.toUpperCase()).maybeSingle();
    to = (p?.user_id as string | undefined) ?? "";
  }
  if (!to || to === me) return null;
  const [x, y] = [me, to].sort();
  const { data: f } = await sb.from("friends").select("status,requested_by,updated_at").eq("a", x).eq("b", y).maybeSingle();
  if (!f) return null;
  if (!fresh(Number(f.updated_at))) return null;
  const accepted = f.status === "accepted";
  if (!accepted && f.requested_by !== me) return null;
  return {
    to: [to],
    note: accepted
      ? { title: `${who} is now your friend`, body: "Say hi 👋", path: "/circle", tag: `friend:${me}` }
      : { title: "Friend request", body: `${who} wants to add you on DockIn`, path: "/circle", tag: `friend:${me}` },
  };
}

export async function POST(req: Request): Promise<Response> {
  const fb = account();
  if (!URL || !ANON || !SERVICE || !fb) return Response.json({ ok: false, reason: "push not configured" }, { status: 503 });

  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return Response.json({ ok: false }, { status: 401 });
  const asUser = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: auth } = await asUser.auth.getUser(jwt);
  const me = auth.user?.id;
  if (!me) return Response.json({ ok: false }, { status: 401 });

  let event: Event;
  try {
    event = (await req.json()) as Event;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const valid =
    event?.type === "test" ||
    ((event?.type === "message" || event?.type === "share") ? typeof event.id === "string" : event?.type === "friend" && (typeof event.to === "string" || typeof event.code === "string"));
  if (!valid) return Response.json({ ok: false }, { status: 400 });
  if (overLimit(me)) return Response.json({ ok: false, reason: "slow down" }, { status: 429 });

  const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const p =
    event.type === "test"
      ? { to: [me], note: { title: "DockIn notifications work ✓", body: "Messages, shared tasks and requests will show up like this.", path: "/settings", tag: "test" } }
      : await plan(sb, me, event);
  if (!p || p.to.length === 0) return Response.json({ ok: true, sent: 0 });
  // People who muted this chat are not told about its messages.
  if (event.type === "message" && p.note.tag) {
    const { data: muted } = await sb.from("thread_reads").select("user_id").eq("thread", p.note.tag).eq("muted", true);
    const off = new Set((muted ?? []).map((r) => r.user_id as string));
    p.to = p.to.filter((u) => !off.has(u));
    if (!p.to.length) return Response.json({ ok: true, sent: 0 });
  }

  const { data: rows } = await sb.from("push_tokens").select("token").in("user_id", p.to.slice(0, 200));
  const tokens = (rows ?? []).map((r) => r.token as string);
  if (!tokens.length) return Response.json({ ok: true, sent: 0, tokens: 0 });

  let access: string;
  try {
    access = await googleToken(fb);
  } catch (e) {
    return Response.json({ ok: false, sent: 0, tokens: tokens.length, errors: [`google auth: ${(e as Error).message}`] }, { status: 200 });
  }
  const dead: string[] = [];
  const errors: string[] = [];
  let sent = 0;
  await Promise.all(
    tokens.map(async (token) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${fb.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: p.note.title, body: p.note.body },
            data: { path: p.note.path },
            android: {
              priority: "high",
              ttl: "86400s",
              notification: {
                channel_id: "social",
                tag: p.note.tag,
                icon: "ic_stat_dockin",
                color: "#7C3D1B",
                default_sound: true,
                notification_priority: "PRIORITY_HIGH",
                visibility: "PRIVATE",
              },
            },
          },
        }),
      });
      if (res.ok) {
        sent += 1;
        return;
      }
      const j = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } } | null;
      const code = j?.error?.details?.find((d) => d.errorCode)?.errorCode ?? j?.error?.status ?? String(res.status);
      errors.push(code);
      // Only tokens FCM says are gone are dropped — a bad payload must never wipe good tokens.
      if (code === "UNREGISTERED" || res.status === 404 || (code === "INVALID_ARGUMENT" && /registration token/i.test(j?.error?.message ?? ""))) dead.push(token);
    }),
  );
  if (dead.length) await sb.from("push_tokens").delete().in("token", dead);
  return Response.json({ ok: true, sent, tokens: tokens.length, errors: [...new Set(errors)] });
}
