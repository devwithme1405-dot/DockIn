import { camuStatus } from "@/lib/camu/session";
import { callerId } from "@/lib/identityServer";

/** Is this user's MyCamu linked? (for showing Connect vs connected). */
export async function GET(req: Request): Promise<Response> {
  const userId = await callerId(req);
  if (!userId) return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  return Response.json({ ok: true, data: await camuStatus(userId) });
}
