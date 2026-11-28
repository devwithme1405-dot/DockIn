import { deleteCreds, service } from "@/lib/camu/store";
import { callerId } from "@/lib/identityServer";

/** Forget this user's stored MyCamu login. */
export async function POST(req: Request): Promise<Response> {
  const userId = await callerId(req);
  if (!userId) return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const sb = service();
  if (sb) await deleteCreds(sb, userId);
  return Response.json({ ok: true });
}
