import { adminCaller, audienceIds, audit, cleanAudience, sendNotice, tokensFor } from "@/lib/adminServer";

/**
 * DockIn Admin → send a notification. `dryRun` only counts who it would reach
 * (people and phones, and how many of those phones confirm delivery), for the
 * "This goes to N people" line before sending.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const c = await adminCaller(req);
  if (c instanceof Response) return c;
  let b: { title?: string; body?: string; path?: string; audience?: unknown; dryRun?: boolean };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const audience = cleanAudience(b.audience ?? { kind: "all" });
  if (!audience) return Response.json({ error: "That audience isn't complete — check the choice and its value." }, { status: 400 });
  if (audience.kind === "all" && c.role !== "owner" && !b.dryRun) return Response.json({ error: "Only the owner can notify everyone" }, { status: 403 });

  let ids: string[] | null;
  let phones: Awaited<ReturnType<typeof tokensFor>>;
  try {
    ids = await audienceIds(c, audience);
    phones = await tokensFor(c, ids);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const people = new Set(phones.map((t) => t.user_id)).size;
  const targeted = ids === null ? people : ids.length;
  const instant = phones.filter((p) => p.caps?.includes("data1")).length;
  if (b.dryRun) return Response.json({ people, phones: phones.length, targeted, instant });

  const title = (b.title ?? "").trim().slice(0, 80);
  const body = (b.body ?? "").trim().slice(0, 240);
  const raw = (b.path ?? "/").trim();
  const path = raw.startsWith("/") && !raw.startsWith("//") ? raw.slice(0, 110) : "/";
  if (!title || !body) return Response.json({ error: "Write a title and a message" }, { status: 400 });
  if (!phones.length) return Response.json({ ok: true, people: 0, phones: 0, targeted, sent: 0, failed: 0, instant: 0, errors: {} });

  const { data: row, error } = await c.sb
    .from("broadcasts")
    .insert({ title, body, path, audience, sent_by: c.me, people, phones: phones.length, targeted })
    .select("id")
    .single();
  if (error || !row) return Response.json({ error: error?.message ?? "could not save" }, { status: 500 });
  try {
    const r = await sendNotice(c, phones, { title, body, path, id: row.id as string });
    await c.sb.from("broadcasts").update({ delivered: r.sent, instant: r.instant, failed: r.failed }).eq("id", row.id);
    await audit(c, "notify", null, { title, audience, people, phones: phones.length, sent: r.sent });
    return Response.json({ ok: true, id: row.id, people, phones: phones.length, targeted, ...r });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
