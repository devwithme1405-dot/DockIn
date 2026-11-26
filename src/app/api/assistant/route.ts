import { createClient } from "@supabase/supabase-js";

/**
 * DockBot's brain on the server: passes the conversation and the tool list to
 * an AI model (any OpenAI-compatible API — OpenRouter by default) and returns
 * its answer. The tools themselves run on the phone, where the student's data
 * lives; this route only ever sees the chat text and what the tools returned.
 *
 * Not switched on yet. Until these Vercel env vars exist it answers 503 and the
 * app uses its built-in demo brain:
 *   ASSISTANT_API_KEY          the provider key (never in the app)
 *   ASSISTANT_MODEL            e.g. "deepseek/deepseek-chat"
 *   ASSISTANT_FALLBACK_MODELS  optional, comma-separated, tried in order when the first fails
 *   ASSISTANT_BASE_URL         optional, default https://openrouter.ai/api/v1
 *   ASSISTANT_DAILY_LIMIT      optional, messages per student per day (default 40)
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

// Per server instance only: a soft guard until a proper per-day counter is in the database.
const used = new Map<string, { day: string; n: number }>();

export async function POST(req: Request): Promise<Response> {
  const key = process.env.ASSISTANT_API_KEY?.trim();
  const model = process.env.ASSISTANT_MODEL?.trim();
  if (!key || !model || !URL || !ANON) return Response.json({ error: "not_configured" }, { status: 503 });

  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return Response.json({ error: "sign_in" }, { status: 401 });
  const sb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: auth } = await sb.auth.getUser(jwt);
  const me = auth.user?.id;
  if (!me) return Response.json({ error: "sign_in" }, { status: 401 });

  const day = new Date().toISOString().slice(0, 10);
  const limit = Number(process.env.ASSISTANT_DAILY_LIMIT) || 40;
  const u = used.get(me);
  const n = u && u.day === day ? u.n : 0;
  if (n >= limit) return Response.json({ error: "daily_limit" }, { status: 429 });
  used.set(me, { day, n: n + 1 });

  let body: { messages?: unknown[]; tools?: unknown[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length > 40) return Response.json({ error: "bad_request" }, { status: 400 });
  if (JSON.stringify(body).length > 120_000) return Response.json({ error: "too_long" }, { status: 413 });

  const base = (process.env.ASSISTANT_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const models = [model, ...(process.env.ASSISTANT_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean)];
  let last = "";
  for (const m of models) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "DockIn" },
        body: JSON.stringify({ model: m, messages: body.messages, tools: body.tools, temperature: 0.3, max_tokens: 700 }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        last = `${m}: ${res.status}`;
        // Busy or down: try the next model. A bad request won't get better elsewhere.
        if (res.status === 429 || res.status >= 500) continue;
        break;
      }
      const j = (await res.json()) as { choices?: { message?: unknown }[] };
      const message = j.choices?.[0]?.message;
      if (message) return Response.json({ message, model: m });
      last = `${m}: empty`;
    } catch (e) {
      last = `${m}: ${(e as Error).name}`;
    }
  }
  return Response.json({ error: "ai_unavailable", detail: last }, { status: 502 });
}
