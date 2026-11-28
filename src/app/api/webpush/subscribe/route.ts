import { callerId } from "@/lib/identityServer";
import { service } from "@/lib/camu/store";

/** Save this browser's Web Push subscription for the signed-in user. */
export async function POST(req: Request): Promise<Response> {
  const userId = await callerId(req);
  if (!userId) return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  let b: { endpoint?: string; p256dh?: string; auth?: string; ua?: string };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return Response.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (!b.endpoint || !b.p256dh || !b.auth) return Response.json({ ok: false, error: "incomplete subscription" }, { status: 400 });
  const sb = service();
  if (!sb) return Response.json({ ok: false, error: "server not ready" }, { status: 503 });
  const { error } = await sb.from("web_push_subs").upsert(
    { endpoint: b.endpoint, user_id: userId, p256dh: b.p256dh, auth: b.auth, ua: (b.ua ?? "").slice(0, 300) },
    { onConflict: "endpoint" },
  );
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
