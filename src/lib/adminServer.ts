import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { account, googleToken } from "./fcm";

/**
 * Server side of DockIn Admin: who is calling (only admins pass), and sending
 * notifications. Uses the service role, so every route checks the caller
 * against public.admins first. Server-only.
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
  | { kind: "preview" }
  | { kind: "user"; userId: string }
  | { kind: "me" };

/** "2.0.57" → [2,0,57]; "3.0-preview.4" → [3,0,4]. Non-numbers count as 0. */
export function versionParts(v: string): number[] {
  return v.split(/[.-]/).map((x) => Number(x.replace(/\D/g, "")) || 0);
}

export function olderThan(v: string | null | undefined, than: string): boolean {
  if (!v || v === "web") return false;
  const a = versionParts(v);
  const b = versionParts(than);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

async function allRows<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The people (user ids) an audience means, or null for "everyone with a phone". */
export async function audienceIds(c: Caller, a: Audience): Promise<string[] | null> {
  const seen = () =>
    allRows<{ user_id: string; last_seen: string; platform: string | null; app_version: string | null; channel: string | null; camu: boolean | null }>(
      (f, t) => c.sb.from("user_seen").select("user_id,last_seen,platform,app_version,channel,camu").range(f, t),
    );
  const ago = (d: number) => Date.now() - d * 86_400_000;
  switch (a.kind) {
    case "all":
      return null;
    case "me":
      return [c.me];
    case "user":
      return [a.userId];
    case "android":
      return (await seen()).filter((s) => s.platform === "android").map((s) => s.user_id);
    case "preview":
      return (await seen()).filter((s) => s.channel === "preview").map((s) => s.user_id);
    case "no_camu":
      return (await seen()).filter((s) => !s.camu).map((s) => s.user_id);
    case "inactive":
      return (await seen()).filter((s) => Date.parse(s.last_seen) < ago(Math.max(1, a.days))).map((s) => s.user_id);
    case "active":
      return (await seen()).filter((s) => Date.parse(s.last_seen) >= ago(Math.max(1, a.days))).map((s) => s.user_id);
    case "version_below":
      return (await seen()).filter((s) => olderThan(s.app_version, a.version)).map((s) => s.user_id);
  }
}

export async function tokensFor(c: Caller, ids: string[] | null): Promise<{ token: string; user_id: string }[]> {
  if (ids === null) return allRows((f, t) => c.sb.from("push_tokens").select("token,user_id").range(f, t));
  const out: { token: string; user_id: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await c.sb.from("push_tokens").select("token,user_id").in("user_id", ids.slice(i, i + 200));
    out.push(...((data ?? []) as { token: string; user_id: string }[]));
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

/** Send one notification to these phones. Dead tokens are removed. */
export async function sendNotice(
  c: Caller,
  tokens: string[],
  n: { title: string; body: string; path: string; id: string },
): Promise<{ sent: number; failed: number; errors: Record<string, number> }> {
  const fb = account();
  if (!fb) throw new Error("Push isn't set up on the server (FIREBASE_SERVICE_ACCOUNT missing).");
  const access = await googleToken(fb);
  const dead: string[] = [];
  const errors: Record<string, number> = {};
  let sent = 0;
  await pool([...new Set(tokens)], 40, async (token) => {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${fb.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: n.title, body: n.body },
            data: { path: n.path, kind: "broadcast", id: n.id },
            android: {
              priority: "high",
              ttl: "172800s",
              notification: {
                channel_id: "updates",
                tag: `dockin-news-${n.id}`,
                icon: "ic_stat_dockin",
                color: "#7C3D1B",
                default_sound: true,
              },
            },
          },
        }),
      });
      if (res.ok) {
        sent++;
        return;
      }
      const j = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } } | null;
      const err = j?.error?.details?.find((d) => d.errorCode)?.errorCode ?? j?.error?.status ?? String(res.status);
      errors[err] = (errors[err] ?? 0) + 1;
      if (err === "UNREGISTERED" || res.status === 404) dead.push(token);
    } catch {
      errors.network = (errors.network ?? 0) + 1;
    }
  });
  for (let i = 0; i < dead.length; i += 200) await c.sb.from("push_tokens").delete().in("token", dead.slice(i, i + 200));
  return { sent, failed: tokens.length - sent, errors };
}
