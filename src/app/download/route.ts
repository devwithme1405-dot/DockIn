import { createClient } from "@supabase/supabase-js";

/**
 * dock-in.vercel.app/download — the link to share for the app. Counts the tap
 * (for DockIn Admin's downloads number), then hands over to the APK on GitHub.
 * ?ch=preview gives the DockIn 3 test build.
 */
export const runtime = "nodejs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const BASE = "https://github.com/devwithme1405-dot/DockIn/releases/download";

export async function GET(req: Request): Promise<Response> {
  const ch = new globalThis.URL(req.url).searchParams.get("ch") === "preview" ? "preview" : "stable";
  if (URL && SERVICE) {
    try {
      const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
      await sb.from("downloads").insert({ channel: ch, agent: (req.headers.get("user-agent") ?? "").slice(0, 200) });
    } catch {
      /* never block the download on counting it */
    }
  }
  return Response.redirect(`${BASE}/${ch === "preview" ? "apk-v3-preview" : "apk-latest"}/DockIn.apk`, 302);
}
