import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { account, googleToken } from "@/lib/fcm";

/**
 * "A new DockIn is out" — a push to every phone with notifications on, sent
 * by CI right after it publishes the APK. Tapping it opens DockIn's update
 * popup. Phones without push still hear about it from the app's own check.
 *
 * Only CI may call this: it sends the RELEASE_PUSH_KEY (Vercel env) in the
 * x-release-key header. Without that env var this answers 503 and does nothing.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

function allowed(given: string | null): boolean {
  const key = process.env.RELEASE_PUSH_KEY?.trim();
  if (!key || key.length < 24 || !given) return false;
  const a = Buffer.from(given.trim());
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Runs `fn` over `items`, at most `n` at a time. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export async function POST(req: Request): Promise<Response> {
  const fb = account();
  if (!process.env.RELEASE_PUSH_KEY || !URL || !SERVICE || !fb) return Response.json({ ok: false, reason: "not configured" }, { status: 503 });
  if (!allowed(req.headers.get("x-release-key"))) return Response.json({ ok: false }, { status: 401 });

  let v: { versionCode?: unknown; versionName?: unknown };
  try {
    v = (await req.json()) as typeof v;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const code = Number(v.versionCode);
  const name = typeof v.versionName === "string" ? v.versionName.slice(0, 20) : "";
  if (!Number.isFinite(code) || code <= 0) return Response.json({ ok: false }, { status: 400 });

  const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const tokens: string[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await sb.from("push_tokens").select("token").range(from, from + 999);
    if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
    tokens.push(...(data ?? []).map((r) => r.token as string));
    if (!data || data.length < 1000) break;
  }
  const unique = [...new Set(tokens)];
  if (!unique.length) return Response.json({ ok: true, sent: 0, tokens: 0 });

  const access = await googleToken(fb);
  const dead: string[] = [];
  const errors: Record<string, number> = {};
  let sent = 0;
  await pool(unique, 40, async (token) => {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${fb.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: "DockIn update ready 🎉",
              body: `Version ${name} is here. Tap to update — takes a few seconds, your data stays.`,
            },
            data: { path: "/?update=1", kind: "update", versionCode: String(code) },
            android: {
              priority: "high",
              // An update stays worth telling about for a few days.
              ttl: "259200s",
              collapse_key: "dockin-update",
              notification: {
                channel_id: "updates",
                tag: "dockin-update",
                icon: "ic_stat_dockin",
                color: "#7C3D1B",
                default_sound: true,
                notification_priority: "PRIORITY_HIGH",
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
      const err = j?.error?.details?.find((d) => d.errorCode)?.errorCode ?? j?.error?.status ?? String(res.status);
      errors[err] = (errors[err] ?? 0) + 1;
      if (err === "UNREGISTERED" || res.status === 404 || (err === "INVALID_ARGUMENT" && /registration token/i.test(j?.error?.message ?? ""))) dead.push(token);
    } catch {
      errors.network = (errors.network ?? 0) + 1;
    }
  });
  for (let i = 0; i < dead.length; i += 200) await sb.from("push_tokens").delete().in("token", dead.slice(i, i + 200));
  return Response.json({ ok: true, sent, tokens: unique.length, dropped: dead.length, errors });
}
