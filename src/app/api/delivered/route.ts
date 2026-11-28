import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { deliveryTicket } from "@/lib/pushTicket";

/**
 * "This phone got the message": sent by DockIn's notification service the
 * moment a chat push lands, so the sender sees ✓✓. The receipt was signed by
 * /api/push for exactly this person and thread, so nobody can mark anything
 * else delivered.
 */

export const runtime = "nodejs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export async function POST(req: Request): Promise<Response> {
  if (!URL || !SERVICE) return Response.json({ ok: false }, { status: 503 });
  let b: { uid?: unknown; thread?: unknown; at?: unknown; sig?: unknown };
  try {
    b = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const { uid, thread, at, sig } = b;
  if (typeof uid !== "string" || typeof thread !== "string" || typeof at !== "string" || typeof sig !== "string") {
    return Response.json({ ok: false }, { status: 400 });
  }
  const want = Buffer.from(deliveryTicket(SERVICE, uid, thread, at));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return Response.json({ ok: false }, { status: 403 });
  const when = Date.parse(at);
  // A receipt older than two days is not news.
  if (!Number.isFinite(when) || Date.now() - when > 2 * 86400_000) return Response.json({ ok: true, stale: true });

  const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
  // A DockIn Admin notification ("bc:<id>"): it reached this student's phone.
  const bc = /^bc:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(thread);
  if (bc) {
    const { error } = await sb.rpc("broadcast_delivered_for", { p_broadcast: bc[1], p_user: uid, p_at: new Date(when).toISOString() });
    if (error) return Response.json({ ok: false, reason: "server" }, { status: 500 });
    return Response.json({ ok: true });
  }
  const { error } = await sb.rpc("mark_delivered_for", { p_user: uid, p_thread: thread, p_at: new Date(when).toISOString() });
  if (error) return Response.json({ ok: false, reason: "server" }, { status: 500 });
  return Response.json({ ok: true });
}
