import { readClaim, serviceClient, signup } from "@/lib/identityServer";

/**
 * A new DockIn account from a MyCamu sign-in: username = enrollment number,
 * password chosen by the student. Only the app can make one (MyCamu sign-in
 * happens inside the app).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const sb = serviceClient();
  if (!sb) return Response.json({ ok: false, code: "server", message: "DockIn's server isn't set up for this yet." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { password?: unknown; notMine?: unknown } | null;
  const c = readClaim(body);
  if (!c) return Response.json({ ok: false, code: "bad_input", message: "MyCamu didn't give a valid enrollment number." }, { status: 400 });
  try {
    return Response.json(await signup(sb, c, String(body?.password ?? ""), body?.notMine === true));
  } catch (e) {
    return Response.json({ ok: false, code: "server", message: `Couldn't make the account: ${(e as Error).message}` }, { status: 500 });
  }
}
