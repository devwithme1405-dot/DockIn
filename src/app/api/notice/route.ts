import { NextResponse } from "next/server";
import { SUPABASE_URL } from "@/lib/supabase";

/**
 * Where the Android app posts the notifications it saw.
 *
 * It exists so the app has one address to know — DockIn's own, which it was
 * already built around — instead of carrying the database's address and key
 * inside the APK. Moving project, or rotating a key, then costs a deploy rather
 * than an app update everybody has to install.
 *
 * It is not a trusted caller: the phone's secret is the whole of the
 * authentication, and `log_notice` in the database checks it. All this does is
 * hand the message along and give back a plain answer.
 */

export const runtime = "nodejs";

const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(request: Request) {
  if (!SUPABASE_URL || !KEY) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const secret = str(body.secret, 200);
  const app = str(body.app, 120);
  if (secret.length < 24 || !app) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const at = Number(body.at);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_notice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      token: secret,
      app,
      title: str(body.title, 200),
      body: str(body.body, 400),
      posted_at: Number.isFinite(at) && at > 0 ? Math.round(at) : Date.now(),
    }),
  });

  if (res.ok) return NextResponse.json({ ok: true });

  // A phone nobody has claimed yet is the ordinary case on a handset where
  // nobody has signed in. 404 tells the app to hold on to the payment and try
  // again later, rather than throwing it away.
  const text = await res.text();
  if (/unknown_device/.test(text)) {
    return NextResponse.json({ error: "unknown device" }, { status: 404 });
  }
  return NextResponse.json({ error: "rejected" }, { status: 502 });
}
