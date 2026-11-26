import { adminCaller, audit } from "@/lib/adminServer";

/**
 * DockIn Admin → suspend or restore an account. A suspension is two things:
 * the bans row (the app shows why, and posting is refused by the database)
 * and Supabase Auth's own ban (no new sign-in or token refresh until it ends).
 */
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const c = await adminCaller(req);
  if (c instanceof Response) return c;
  let b: { userId?: string; reason?: string; days?: number | null; unban?: boolean };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const uid = b.userId ?? "";
  if (!/^[0-9a-f-]{36}$/.test(uid)) return Response.json({ error: "bad user" }, { status: 400 });
  if (uid === c.me) return Response.json({ error: "You can't suspend yourself" }, { status: 400 });
  const { data: target } = await c.sb.from("admins").select("role").eq("user_id", uid).maybeSingle();
  if (target && c.role !== "owner") return Response.json({ error: "Only the owner can suspend an admin" }, { status: 403 });

  if (b.unban) {
    await c.sb.from("bans").delete().eq("user_id", uid);
    const { error } = await c.sb.auth.admin.updateUserById(uid, { ban_duration: "none" });
    await audit(c, "unban", uid, null);
    return Response.json({ ok: true, auth: !error });
  }

  const reason = (b.reason ?? "").trim().slice(0, 300) || "Breaking DockIn's rules";
  const days = typeof b.days === "number" && b.days > 0 ? Math.min(Math.round(b.days), 3650) : null;
  const until = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const { error: e1 } = await c.sb.from("bans").upsert({ user_id: uid, reason, banned_by: c.me, banned_at: new Date().toISOString(), until });
  if (e1) return Response.json({ error: e1.message }, { status: 500 });
  // Auth ban: "876000h" ≈ 100 years for "until I lift it".
  const { error: e2 } = await c.sb.auth.admin.updateUserById(uid, { ban_duration: days ? `${days * 24}h` : "876000h" });
  await audit(c, "ban", uid, { reason, days });
  return Response.json({ ok: true, until, auth: !e2 });
}
