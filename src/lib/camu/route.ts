/**
 * Shared plumbing for the /api/camu/* routes: who's calling (the signed-in
 * DockIn user), and turning a MyCamu result or error into a clean JSON response.
 * Server-only.
 */

import { callerId } from "../identityServer";
import { CamuError } from "./client";
import { camuConfigured } from "./store";

const STATUS: Record<CamuError["kind"], number> = {
  credentials: 400,
  expired: 440, // our own: "reconnect MyCamu"
  network: 502,
  camu: 502,
};

export function ok(data: unknown): Response {
  return Response.json({ ok: true, data }, { status: 200 });
}

/**
 * Runs `fn` for the signed-in user and returns its result as JSON. Handles:
 *   - not signed in            → 401
 *   - server not set up        → 503
 *   - MyCamu not linked / bad  → 400 with needsLink, so the app opens Connect MyCamu
 *   - MyCamu errors / network  → 502
 */
export async function run(req: Request, fn: (userId: string) => Promise<unknown>): Promise<Response> {
  if (!camuConfigured()) return Response.json({ ok: false, error: "MyCamu isn't set up on the server yet." }, { status: 503 });
  const userId = await callerId(req);
  if (!userId) return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  try {
    return ok(await fn(userId));
  } catch (e) {
    if (e instanceof CamuError) {
      const needsLink = e.kind === "credentials" && /connect|link/i.test(e.message);
      return Response.json({ ok: false, error: e.message, kind: e.kind, needsLink }, { status: STATUS[e.kind] });
    }
    return Response.json({ ok: false, error: (e as Error).message || "Something went wrong." }, { status: 500 });
  }
}

/** Reads and returns the JSON body, or {} if there isn't one. */
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
