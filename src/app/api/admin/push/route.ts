import { adminCaller, audienceIds, audit, cleanAudience, sendNotice, tokensFor } from "@/lib/adminServer";
import { sendWebPush, webPushConfigured } from "@/lib/webpushServer";

/**
 * DockIn Admin → send a notification. Goes to Android phones (FCM) AND to web /
 * iPhone PWAs (Web Push) — the two run side by side, each independent. `dryRun`
 * only counts who it would reach, for the "This goes to N people" line.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** How many web (iPhone/browser) subscriptions the audience covers. */
async function webReach(sb: Parameters<typeof sendWebPush>[0], ids: string[] | null): Promise<number> {
  if (!webPushConfigured()) return 0;
  try {
    if (ids === null) {
      const { count } = await sb.from("web_push_subs").select("endpoint", { count: "exact", head: true });
      return count ?? 0;
    }
    if (!ids.length) return 0;
    let n = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const { count } = await sb.from("web_push_subs").select("endpoint", { count: "exact", head: true }).in("user_id", ids.slice(i, i + 200));
      n += count ?? 0;
    }
    return n;
  } catch {
    return 0;
  }
}

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
  let web = 0;
  try {
    ids = await audienceIds(c, audience);
    [phones, web] = await Promise.all([tokensFor(c, ids), webReach(c.sb, ids)]);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const people = new Set(phones.map((t) => t.user_id)).size;
  const targeted = ids === null ? people : ids.length;
  const instant = phones.filter((p) => p.caps?.includes("data1")).length;
  if (b.dryRun) return Response.json({ people, phones: phones.length, targeted, instant, web });

  const title = (b.title ?? "").trim().slice(0, 80);
  const body = (b.body ?? "").trim().slice(0, 240);
  const raw = (b.path ?? "/").trim();
  const path = raw.startsWith("/") && !raw.startsWith("//") ? raw.slice(0, 110) : "/";
  if (!title || !body) return Response.json({ error: "Write a title and a message" }, { status: 400 });
  if (!phones.length && !web) return Response.json({ ok: true, people: 0, phones: 0, targeted, sent: 0, failed: 0, instant: 0, web: 0, errors: {} });

  const { data: row, error } = await c.sb
    .from("broadcasts")
    .insert({ title, body, path, audience, sent_by: c.me, people, phones: phones.length, targeted })
    .select("id")
    .single();
  if (error || !row) return Response.json({ error: error?.message ?? "could not save" }, { status: 500 });
  const id = row.id as string;

  // Android (FCM) and web / iPhone (Web Push) in parallel; a failure in one never
  // stops the other.
  const [fcm, wp] = await Promise.all([
    phones.length ? sendNotice(c, phones, { title, body, path, id }) : Promise.resolve({ sent: 0, failed: 0, instant: 0, errors: {} as Record<string, number> }),
    sendWebPush(c.sb, ids, { title, body, path, id, tag: `dockin-news-${id}` }).catch(() => ({ sent: 0, failed: 0, subs: 0 })),
  ]);

  await c.sb.from("broadcasts").update({ delivered: fcm.sent, instant: fcm.instant, failed: fcm.failed }).eq("id", id);
  await audit(c, "notify", null, { title, audience, people, phones: phones.length, sent: fcm.sent, web: wp.sent });
  return Response.json({ ok: true, id, people, phones: phones.length, targeted, web: wp.sent, ...fcm });
}
