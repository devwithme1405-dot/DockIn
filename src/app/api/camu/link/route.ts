import { login } from "@/lib/camu/client";
import { saveCreds, service } from "@/lib/camu/store";
import { callerId } from "@/lib/identityServer";
import { camuConfigured } from "@/lib/camu/store";
import { body } from "@/lib/camu/route";
import { CamuError } from "@/lib/camu/client";

/** Connect a MyCamu login: validate the email/password, then store it (encrypted). */
export async function POST(req: Request): Promise<Response> {
  if (!camuConfigured()) return Response.json({ ok: false, error: "MyCamu isn't set up on the server yet." }, { status: 503 });
  const userId = await callerId(req);
  if (!userId) return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const { email, password } = await body<{ email?: string; password?: string }>(req);
  if (!email || !password) return Response.json({ ok: false, error: "Enter your MyCamu email and password." }, { status: 400 });
  try {
    const s = await login(email, password);
    const sb = service();
    if (!sb) return Response.json({ ok: false, error: "Server not ready." }, { status: 503 });
    await saveCreds(sb, userId, email, password, s.ids, s.cookie);
    return Response.json({ ok: true, data: { name: s.ids.name, stuId: s.ids.stuId, semName: s.ids.semName } });
  } catch (e) {
    if (e instanceof CamuError) return Response.json({ ok: false, error: e.message, kind: e.kind }, { status: e.kind === "credentials" ? 400 : 502 });
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
