/**
 * Turns a stored MyCamu login into a usable session for a DockIn user. Reuses
 * the saved connect.sid cookie while it's fresh, and signs in again (with the
 * stored password) only when there isn't one or MyCamu says it expired — so a
 * student types their MyCamu password once, and every later action just works.
 * Server-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CamuError, login, type CamuSession } from "./client";
import { getCreds, open, saveSession, service, type CamuCredRow } from "./store";

/** Reuse a cached cookie for this long before signing in again (MyCamu's lasts ~30 days). */
const SESSION_FRESH_MS = 14 * 24 * 60 * 60 * 1000;

function fromRow(row: CamuCredRow): CamuSession | null {
  const cookie = open(row.session_enc);
  if (!cookie || !row.ids) return null;
  if (!row.session_at || Date.now() - Date.parse(row.session_at) > SESSION_FRESH_MS) return null;
  return { cookie, ids: row.ids };
}

async function freshLogin(sb: SupabaseClient, userId: string, row: CamuCredRow): Promise<CamuSession> {
  const password = open(row.pwd_enc);
  if (!password) throw new CamuError("DockIn can't read your saved MyCamu login — connect it again.", "credentials");
  const s = await login(row.email, password);
  await saveSession(sb, userId, s.cookie, s.ids);
  return s;
}

/**
 * Runs `fn` with a live MyCamu session for this user. Reuses the cached session;
 * if MyCamu reports it expired mid-call, signs in again once and retries. Throws
 * CamuError("credentials") when the user hasn't linked MyCamu, so routes can tell
 * the app to show the connect screen.
 */
export async function withCamu<T>(userId: string, fn: (s: CamuSession) => Promise<T>): Promise<T> {
  const sb = service();
  if (!sb) throw new CamuError("MyCamu isn't set up on the server.", "network");
  const row = await getCreds(sb, userId);
  if (!row) throw new CamuError("Connect your MyCamu login first.", "credentials");

  let session = fromRow(row);
  if (!session) session = await freshLogin(sb, userId, row);

  try {
    return await fn(session);
  } catch (e) {
    if (e instanceof CamuError && e.kind === "expired") {
      const retry = await freshLogin(sb, userId, row);
      return await fn(retry);
    }
    throw e;
  }
}

/** Whether this user has a MyCamu login stored, with the name and last-ok time. */
export async function camuStatus(userId: string): Promise<{ linked: boolean; name?: string; stuId?: string; lastOk?: string | null }> {
  const sb = service();
  if (!sb) return { linked: false };
  const row = await getCreds(sb, userId);
  if (!row) return { linked: false };
  return { linked: true, name: row.name ?? undefined, stuId: row.stu_id ?? undefined, lastOk: row.last_ok };
}
