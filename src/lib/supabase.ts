import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase wants the bare project address. The dashboard shows several longer
 * ones next to it — the REST endpoint ends in `/rest/v1` — and pasting one of
 * those makes every sign-in call land on a path that does not exist, which comes
 * back as a flat 404 with nothing to tell you why. Keep only the origin, so a
 * trailing slash or a copied path cannot break the deployment.
 */
export function projectOrigin(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  try {
    return new globalThis.URL(trimmed).origin;
  } catch {
    return undefined;
  }
}

const URL = projectOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/** The project address, already tidied. Used by the few calls that bypass the client. */
export const SUPABASE_URL = URL;

/** Bennett students only. The database enforces this too; this is for friendly messages. */
export const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "bennett.edu.in";

export const isCloudConfigured = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

/** The Supabase client, or null when the app runs without a cloud project (local only). */
export function getSupabase(): SupabaseClient | null {
  if (!URL || !KEY) return null;
  if (typeof window === "undefined") return null;
  if (!client) {
    client = createClient(URL, KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}
