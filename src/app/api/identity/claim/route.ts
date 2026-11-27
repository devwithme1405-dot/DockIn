import { callerId, claim, readClaim, serviceClient } from "@/lib/identityServer";

/**
 * A signed-in student confirms who they are with what their own MyCamu sign-in
 * says (enrollment + MyCamu student id). Their username becomes the enrollment.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const sb = serviceClient();
  if (!sb) return Response.json({ ok: false, code: "server", message: "DockIn's server isn't set up for this yet." }, { status: 503 });
  const me = await callerId(req);
  if (!me) return Response.json({ ok: false, code: "server", message: "Sign in again." }, { status: 401 });
  const c = readClaim(await req.json().catch(() => null));
  if (!c) return Response.json({ ok: false, code: "bad_input", message: "MyCamu didn't give a valid enrollment number." }, { status: 400 });
  try {
    return Response.json(await claim(sb, me, c));
  } catch (e) {
    return Response.json({ ok: false, code: "server", message: `Couldn't save it: ${(e as Error).message}` }, { status: 500 });
  }
}
