import { adminCaller } from "@/lib/adminServer";
import { account, googleToken } from "@/lib/fcm";

/**
 * DockIn Admin → "is the server side set up?" Each thing notifications and the
 * dashboard need, checked for real, with the exact reason when one isn't. No
 * secret is ever returned — only whether it is there and works.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export async function GET(req: Request): Promise<Response> {
  const c = await adminCaller(req);
  if (c instanceof Response) return c;
  const checks: Check[] = [];

  const day = new Date(Date.now() - 86_400_000).toISOString();
  try {
    const all = await c.sb.from("user_seen").select("user_id", { count: "exact", head: true });
    if (all.error) throw new Error(all.error.message);
    const recent = await c.sb.from("user_seen").select("user_id", { count: "exact", head: true }).gte("last_seen", day);
    const n = all.count ?? 0;
    checks.push({
      id: "seen",
      label: "Apps reporting in",
      ok: n > 0,
      detail: n ? `${n} students have reported · ${recent.count ?? 0} in the last 24 h` : "No app has reported yet — open DockIn on a phone, then check again.",
    });
  } catch (e) {
    checks.push({ id: "seen", label: "Apps reporting in", ok: false, detail: `Can't read it: ${(e as Error).message}. Has migration 0029 run?` });
  }

  try {
    const all = await c.sb.from("push_tokens").select("token", { count: "exact", head: true });
    if (all.error) throw new Error(all.error.message);
    const mine = await c.sb.from("push_tokens").select("token", { count: "exact", head: true }).eq("user_id", c.me);
    const n = all.count ?? 0;
    checks.push({
      id: "tokens",
      label: "Phones that can get notifications",
      ok: n > 0,
      detail: `${n} phones in all · ${mine.count ? `${mine.count} of them yours` : "none of them yours — open the DockIn student app on your phone with notifications on"}`,
    });
  } catch (e) {
    checks.push({ id: "tokens", label: "Phones that can get notifications", ok: false, detail: (e as Error).message });
  }

  // The admin's own phone, end to end: did the student app report in?
  {
    const { data: me } = await c.sb.from("user_seen").select("last_seen,platform,app_version,camu,lms,notifications").eq("user_id", c.me).maybeSingle();
    const fresh = me && Date.now() - Date.parse(me.last_seen as string) < 2 * 86_400_000;
    checks.push({
      id: "me",
      label: "Your own phone",
      ok: !!fresh,
      detail: me
        ? `Last reported ${new Date(me.last_seen as string).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · ${me.platform ?? "?"} ${me.app_version ?? ""} · MyCamu ${me.camu === true ? "connected" : me.camu === false ? "not connected" : "unknown"} · LMS ${me.lms === true ? "connected" : me.lms === false ? "not connected" : "unknown"} · notifications ${me.notifications ?? "unknown"}`
        : "Your DockIn account has never reported — open the DockIn student app (signed in as you), wait 10 seconds, then check again.",
    });
  }

  const fb = account();
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    checks.push({ id: "firebase", label: "Firebase (sending)", ok: false, detail: "FIREBASE_SERVICE_ACCOUNT isn't set in Vercel → Settings → Environment Variables." });
  } else if (!fb) {
    checks.push({ id: "firebase", label: "Firebase (sending)", ok: false, detail: "FIREBASE_SERVICE_ACCOUNT is set but isn't a valid service-account JSON (needs project_id, client_email, private_key)." });
  } else {
    try {
      await googleToken(fb);
      checks.push({ id: "firebase", label: "Firebase (sending)", ok: true, detail: `Signed in to Google as the ${fb.project_id} service account` });
    } catch (e) {
      checks.push({ id: "firebase", label: "Firebase (sending)", ok: false, detail: `Google refused the service account (${(e as Error).message}). The key may be revoked — make a new one in Firebase.` });
    }
  }

  return Response.json({ checks, at: new Date().toISOString() });
}
