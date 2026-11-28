import { callerId } from "@/lib/identityServer";
import { service } from "@/lib/camu/store";

/** Forget a Web Push subscription (by endpoint). */
export async function POST(req: Request): Promise<Response> {
  const userId = await callerId(req);
  if (!userId) return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const sb = service();
  if (sb && endpoint) await sb.from("web_push_subs").delete().eq("endpoint", endpoint).eq("user_id", userId);
  return Response.json({ ok: true });
}
