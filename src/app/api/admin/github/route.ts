import { adminCaller } from "@/lib/adminServer";

/**
 * DockIn Admin → APK downloads as GitHub counts them. Each build replaces its
 * release, so this is "downloads of the current APK", not all-time (all-time
 * starts with the /download link, counted in the database).
 */
export const runtime = "nodejs";

const REPO = "devwithme1405-dot/DockIn";
const TAGS = ["apk-latest", "apk-v3-preview", "apk-admin"];
let cache: { at: number; body: unknown } | null = null;

export async function GET(req: Request): Promise<Response> {
  const c = await adminCaller(req);
  if (c instanceof Response) return c;
  if (cache && Date.now() - cache.at < 10 * 60_000) return Response.json(cache.body);
  const out: { tag: string; name: string; published: string | null; downloads: number }[] = [];
  for (const tag of TAGS) {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "dockin-admin" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const r = (await res.json()) as { name?: string; published_at?: string; assets?: { name: string; download_count: number }[] };
      const apk = r.assets?.find((a) => a.name.endsWith(".apk"));
      out.push({ tag, name: r.name ?? tag, published: r.published_at ?? null, downloads: apk?.download_count ?? 0 });
    } catch {
      /* GitHub busy: show what we have */
    }
  }
  const body = { releases: out, at: Date.now() };
  cache = { at: Date.now(), body };
  return Response.json(body);
}
