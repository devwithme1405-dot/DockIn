import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
