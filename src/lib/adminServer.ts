import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { account, googleToken } from "./fcm";
import { deliveryTicket } from "./pushTicket";

/**
 * Server side of DockIn Admin: who is calling (only admins pass), who a
 * notification is for, and sending it. Uses the service role, so every route
 * checks the caller against public.admins first. Server-only.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export interface Caller {
  sb: SupabaseClient;
  me: string;
  role: "owner" | "moderator";
}

/** The admin making this request, or the Response to send back instead. */
export async function adminCaller(req: Request): Promise<Caller | Response> {
  if (!URL || !ANON || !SERVICE) return Response.json({ error: "Admin isn't set up on the server (Supabase service key missing)." }, { status: 503 });
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return Response.json({ error: "Sign in" }, { status: 401 });
  const asUser = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await asUser.auth.getUser(jwt);
  const me = data.user?.id;
  if (!me) return Response.json({ error: "Sign in" }, { status: 401 });
  const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data: row } = await sb.from("admins").select("role").eq("user_id", me).maybeSingle();
  if (!row) return Response.json({ error: "Not an admin" }, { status: 403 });
  return { sb, me, role: row.role as Caller["role"] };
}

export async function audit(c: Caller, action: string, target: string | null, detail: unknown) {
  await c.sb.from("admin_audit").insert({ admin: c.me, action, target, detail });
}

/** Who a notification goes to. */
export type Audience =
  | { kind: "all" }
  | { kind: "android" }
  | { kind: "inactive"; days: number }
  | { kind: "active"; days: number }
  | { kind: "no_camu" }
  | { kind: "version_below"; version: string }
  | { kind: "outdated" }
  | { kind: "preview" }
  | { kind: "unverified" }
  | { kind: "branch"; value: string }
  | { kind: "year"; value: number }
  | { kind: "users"; ids: string[] }
  | { kind: "user"; userId: string }
  | { kind: "me" };

export const AUDIENCE_KINDS = new Set<Audience["kind"]>([
  "all", "android", "inactive", "active", "no_camu", "version_below", "outdated", "preview", "unverified", "branch", "year", "users", "user", "me",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Checks and tidies an audience from the browser; null if it isn't one. */
export function cleanAudience(a: unknown): Audience | null {
  const o = (a ?? {}) as Record<string, unknown>;
  const kind = o.kind as Audience["kind"];
  if (!AUDIENCE_KINDS.has(kind)) return null;
  const days = Math.min(365, Math.max(1, Math.round(Number(o.days) || 7)));
  switch (kind) {
    case "active":
    case "inactive":
      return { kind, days };
    case "version_below":
      return typeof o.version === "string" && /^[0-9][0-9a-z.-]{0,29}$/i.test(o.version) ? { kind, version: o.version } : null;
    case "branch":
      return typeof o.value === "string" && o.value.trim() ? { kind, value: o.value.trim().slice(0, 40) } : null;
    case "year": {
      const y = Math.round(Number(o.value));
      return y >= 1 && y <= 5 ? { kind, value: y } : null;
    }
    case "users": {
      const ids = Array.isArray(o.ids) ? [...new Set(o.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 2000) : [];
      return ids.length ? { kind, ids } : null;
    }
    case "user":
      return typeof o.userId === "string" && UUID.test(o.userId) ? { kind, userId: o.userId } : null;
    default:
      return { kind } as Audience;
  }
}

/** "2.0.57" → [2,0,57]; "3.0-preview.4" → [3,0,0,4]. Non-numbers count as 0. Same rule as the database's version_key. */
export function versionParts(v: string): number[] {
  return v.split(/[.-]/).map((x) => Number(x.replace(/\D/g, "")) || 0);
}

export function compareVersions(a: string, b: string): number {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function olderThan(v: string | null | undefined, than: string): boolean {
  if (!v || v === "web") return false;
  return compareVersions(v, than) < 0;
}

async function allRows<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Seen = { user_id: string; last_seen: string; platform: string | null; app_version: string | null; channel: string | null; camu: boolean | null };

/** The people (user ids) an audience means, or null for "everyone with a phone". */
export async function audienceIds(c: Caller, a: Audience): Promise<string[] | null> {
  const seen = () =>
    allRows<Seen>((f, t) => c.sb.from("user_seen").select("user_id,last_seen,platform,app_version,channel,camu").range(f, t));
  const ago = (d: number) => Date.now() - d * 86_400_000;
  switch (a.kind) {
    case "all":
      return null;
    case "me":
      return [c.me];
    case "user":
      return [a.userId];
    case "users":
      return a.ids;
    case "android":
      return (await seen()).filter((s) => s.platform === "android").map((s) => s.user_id);
    case "preview":
      return (await seen()).filter((s) => s.channel === "preview").map((s) => s.user_id);
    case "no_camu":
      return (await seen()).filter((s) => !s.camu).map((s) => s.user_id);
    case "inactive":
      return (await seen()).filter((s) => Date.parse(s.last_seen) < ago(a.days)).map((s) => s.user_id);
    case "active":
      return (await seen()).filter((s) => Date.parse(s.last_seen) >= ago(a.days)).map((s) => s.user_id);
    case "version_below":
      return (await seen()).filter((s) => olderThan(s.app_version, a.version)).map((s) => s.user_id);
    case "outdated": {
      const rows = (await seen()).filter((s) => s.platform === "android" && s.channel !== "preview" && s.app_version);
      const latest = rows.reduce<string | null>((m, s) => (m === null || compareVersions(s.app_version!, m) > 0 ? s.app_version! : m), null);
      return latest ? rows.filter((s) => compareVersions(s.app_version!, latest) < 0).map((s) => s.user_id) : [];
    }
    case "unverified": {
      const [verified, people, phones] = await Promise.all([
        allRows<{ user_id: string }>((f, t) => c.sb.from("identities").select("user_id").range(f, t)),
        seen(),
        allRows<{ user_id: string }>((f, t) => c.sb.from("push_tokens").select("user_id").range(f, t)),
      ]);
      const ok = new Set(verified.map((r) => r.user_id));
      return [...new Set([...people.map((r) => r.user_id), ...phones.map((r) => r.user_id)])].filter((u) => !ok.has(u));
    }
    case "branch": {
      const rows = await allRows<{ user_id: string }>((f, t) => c.sb.from("profiles").select("user_id").ilike("branch", `%${a.value.replace(/[%_]/g, "")}%`).range(f, t));
      return rows.map((r) => r.user_id);
    }
    case "year": {
      const rows = await allRows<{ user_id: string }>((f, t) => c.sb.from("profiles").select("user_id").eq("year", a.value).range(f, t));
      return rows.map((r) => r.user_id);
    }
  }
}

export interface Phone {
  token: string;
  user_id: string;
  caps: string | null;
}

export async function tokensFor(c: Caller, ids: string[] | null): Promise<Phone[]> {
  if (ids === null) return allRows<Phone>((f, t) => c.sb.from("push_tokens").select("token,user_id,caps").range(f, t));
  const out: Phone[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await c.sb.from("push_tokens").select("token,user_id,caps").in("user_id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Phone[]));
  }
  return out;
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/** The path the notification opens, tagged so the app reports the open. */
export function withOpenTag(path: string, id: string): string {
  const u = new globalThis.URL(path, "https://x.invalid");
  u.searchParams.set("n", id);
  return u.pathname + u.search;
}

/**
 * One FCM message for one phone. A phone on the current app (caps "data1")
 * gets the notification as data: DockIn shows it itself — open, in the
 * background or closed alike — and sends back a signed receipt the moment it
 * lands (/api/delivered), which is how the dashboard knows it really arrived.
 * Older apps get a plain notification (Android shows it; no receipt).
 */
export function broadcastMessage(p: Phone, n: { title: string; body: string; path: string; id: string; at: string }) {
  const open = withOpenTag(n.path, n.id);
  if (p.caps?.includes("data1") && SERVICE) {
    const thread = `bc:${n.id}`;
    return {
      token: p.token,
      data: {
        kind: "note",
        title: n.title,
        body: n.body,
        path: open,
        tag: `dockin-news-${n.id}`,
        nid: `bc-${n.id}`,
        uid: p.user_id,
        thread,
        at: n.at,
        sig: deliveryTicket(SERVICE, p.user_id, thread, n.at),
      },
      android: { priority: "high", ttl: "172800s" },
    };
  }
  return {
    token: p.token,
    notification: { title: n.title, body: n.body },
    data: { path: open, kind: "broadcast", id: n.id },
    android: {
      priority: "high",
      ttl: "172800s",
      notification: { channel_id: "updates", tag: `dockin-news-${n.id}`, icon: "ic_stat_dockin", color: "#7C3D1B", default_sound: true },
    },
  };
}

/** Send one notification to these phones. Google's busy / internal errors are retried; dead tokens are removed. */
export async function sendNotice(
  c: Caller,
  phones: Phone[],
  n: { title: string; body: string; path: string; id: string },
): Promise<{ sent: number; failed: number; instant: number; errors: Record<string, number> }> {
  const fb = account();
  if (!fb) throw new Error("Push isn't set up on the server (FIREBASE_SERVICE_ACCOUNT missing).");
  const access = await googleToken(fb);
  const at = new Date().toISOString();
  const unique = [...new Map(phones.map((p) => [p.token, p])).values()];
  const dead: string[] = [];
  const errors: Record<string, number> = {};
  let sent = 0;
  let instant = 0;
  await pool(unique, 40, async (p) => {
    const message = broadcastMessage(p, { ...n, at });
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await new Promise((ok) => setTimeout(ok, 300 * 3 ** (attempt - 1)));
      let res: Response;
      try {
        res = await fetch(`https://fcm.googleapis.com/v1/projects/${fb.project_id}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
          body: JSON.stringify({ message }),
        });
      } catch {
        if (attempt === 3) errors.network = (errors.network ?? 0) + 1;
        continue;
      }
      if (res.ok) {
        sent++;
        if ("data" in message && message.data.kind === "note") instant++;
        return;
      }
      const j = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } } | null;
      const err = j?.error?.details?.find((d) => d.errorCode)?.errorCode ?? j?.error?.status ?? String(res.status);
      if ((res.status === 429 || res.status >= 500) && attempt < 3) continue;
      errors[err] = (errors[err] ?? 0) + 1;
      if (err === "UNREGISTERED" || res.status === 404 || (err === "INVALID_ARGUMENT" && /registration token/i.test(j?.error?.message ?? ""))) dead.push(p.token);
      return;
    }
  });
  for (let i = 0; i < dead.length; i += 200) await c.sb.from("push_tokens").delete().in("token", dead.slice(i, i + 200));
  return { sent, failed: unique.length - sent, instant, errors };
}
