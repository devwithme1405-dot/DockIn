/**
 * Where a student's MyCamu login lives on the server: the password and the live
 * session cookie, both encrypted (AES-256-GCM) with a key only the server has
 * (CAMU_ENC_KEY). The table itself is service-role only (RLS, no policies), so
 * these two walls together mean a stored password is useless without the server
 * key even to someone who reaches the database. Server-only.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CamuIds } from "./client";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ENC_KEY = process.env.CAMU_ENC_KEY?.trim();

/** The 32-byte key for encrypting MyCamu secrets, from CAMU_ENC_KEY (base64 or hex). */
function key(): Buffer | null {
  if (!ENC_KEY) return null;
  const b = /^[0-9a-f]{64}$/i.test(ENC_KEY) ? Buffer.from(ENC_KEY, "hex") : Buffer.from(ENC_KEY, "base64");
  return b.length === 32 ? b : null;
}

export function camuConfigured(): boolean {
  return !!(URL && SERVICE && key());
}

/** Encrypts a secret to "iv:ciphertext:tag" (all base64). Throws if no key. */
export function seal(plain: string): string {
  const k = key();
  if (!k) throw new Error("CAMU_ENC_KEY is not set on the server.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${iv.toString("base64")}:${enc.toString("base64")}:${c.getAuthTag().toString("base64")}`;
}

/** Reverses {@link seal}; null if the key is missing or the blob is wrong. */
export function open(blob: string | null | undefined): string | null {
  const k = key();
  if (!k || !blob) return null;
  const [iv, enc, tag] = blob.split(":");
  if (!iv || !enc || !tag) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function service(): SupabaseClient | null {
  if (!URL || !SERVICE) return null;
  return createClient(URL, SERVICE, { auth: { persistSession: false } });
}

export interface CamuCredRow {
  user_id: string;
  email: string;
  pwd_enc: string;
  ids: CamuIds | null;
  session_enc: string | null;
  session_at: string | null;
  name: string | null;
  stu_id: string | null;
  last_ok: string | null;
}

export async function getCreds(sb: SupabaseClient, userId: string): Promise<CamuCredRow | null> {
  const { data } = await sb.from("camu_creds").select("*").eq("user_id", userId).maybeSingle();
  return (data as CamuCredRow) ?? null;
}

/** Saves (or replaces) a student's MyCamu login after a successful sign-in. */
export async function saveCreds(sb: SupabaseClient, userId: string, email: string, password: string, ids: CamuIds, sessionCookie: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await sb.from("camu_creds").upsert({
    user_id: userId,
    email: email.trim(),
    pwd_enc: seal(password),
    ids,
    session_enc: seal(sessionCookie),
    session_at: now,
    name: ids.name,
    stu_id: ids.stuId,
    linked_at: now,
    last_ok: now,
  });
  if (error) throw new Error(error.message);
}

/** Stores a freshly renewed session cookie (and marks the login as working). */
export async function saveSession(sb: SupabaseClient, userId: string, sessionCookie: string, ids?: CamuIds): Promise<void> {
  const now = new Date().toISOString();
  await sb
    .from("camu_creds")
    .update({ session_enc: seal(sessionCookie), session_at: now, last_ok: now, ...(ids ? { ids, stu_id: ids.stuId, name: ids.name } : {}) })
    .eq("user_id", userId);
}

export async function deleteCreds(sb: SupabaseClient, userId: string): Promise<void> {
  await sb.from("camu_creds").delete().eq("user_id", userId);
}
