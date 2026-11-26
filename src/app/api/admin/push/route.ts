import { adminCaller, audienceIds, audit, sendNotice, tokensFor, type Audience } from "@/lib/adminServer";

/**
 * DockIn Admin → send a notification. `dryRun` only counts who it would reach
 * (people and phones), for the "This goes to N people" line before sending.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS = new Set(["all", "android", "inactive", "active", "no_camu", "version_below", "preview", "user", "me"]);

export async function POST(req: Request): Promise<Response> {
  const c = await adminCaller(req);
  if (c instanceof Response) return c;
  let b: { title?: string; body?: string; path?: string; audience?: Audience; dryRun?: boolean };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const audience = b.audience ?? { kind: "all" };
  if (!KINDS.has(audience.kind)) return Response.json({ error: "bad audience" }, { status: 400 });
  if (audience.kind === "all" && c.role !== "owner" && !b.dryRun) return Response.json({ error: "Only the owner can notify everyone" }, { status: 403 });

  let ids: string[] | null;
  let tokens: { token: string; user_id: string }[];
  try {
    ids = await audienceIds(c, audience);
    tokens = await tokensFor(c, ids);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const people = new Set(tokens.map((t) => t.user_id)).size;
  const targeted = ids === null ? people : ids.length;
  if (b.dryRun) return Response.json({ people, phones: tokens.length, targeted });

  const title = (b.title ?? "").trim().slice(0, 80);
  const body = (b.body ?? "").trim().slice(0, 240);
  const path = (b.path ?? "/").trim().startsWith("/") ? (b.path ?? "/").trim().slice(0, 120) : "/";
  if (!title || !body) return Response.json({ error: "Write a title and a message" }, { status: 400 });

  const { data: row, error } = await c.sb
    .from("broadcasts")
    .insert({ title, body, path, audience, sent_by: c.me, people, phones: tokens.length })
    .select("id")
    .single();
  if (error || !row) return Response.json({ error: error?.message ?? "could not save" }, { status: 500 });
  try {
    const r = await sendNotice(c, tokens.map((t) => t.token), { title, body, path, id: row.id as string });
    await c.sb.from("broadcasts").update({ delivered: r.sent }).eq("id", row.id);
    await audit(c, "notify", null, { title, audience, people, phones: tokens.length, sent: r.sent });
    return Response.json({ ok: true, id: row.id, people, phones: tokens.length, ...r });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
