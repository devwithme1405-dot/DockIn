import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

/**
 * Server side of "your username is your enrollment number". The app reads the
 * enrollment and MyCamu's student id from the student's own MyCamu sign-in and
 * sends them here; this decides what happens to the username, and only this
 * (with the service role) changes it. Server-only.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export const ENROLLMENT = /^[A-Z]{1,2}\d{2}[A-Z]{2,6}\d{2,6}$/;
const STU_ID = /^[a-f0-9]{24}$/;

export interface Claim {
  enrollment: string;
  stuId: string;
  name: string;
}

export type Outcome =
  | { ok: true; username: string; renamed?: string }
  | { ok: false; code: "bad_input" | "already_linked" | "conflict" | "exists_unverified" | "server" | "weak_password"; message: string; username?: string };

/** Cleans what the app sent; null when it isn't a real enrollment / MyCamu id. */
export function readClaim(b: unknown): Claim | null {
  const o = (b ?? {}) as Record<string, unknown>;
  const enrollment = String(o.enrollment ?? "").trim().toUpperCase();
  const stuId = String(o.stuId ?? "").trim().toLowerCase();
  const name = String(o.name ?? "").trim().slice(0, 80);
  if (!ENROLLMENT.test(enrollment) || !STU_ID.test(stuId)) return null;
  return { enrollment, stuId, name };
}

export const emailOf = (username: string) => `${username.toLowerCase()}@dockin.app`;

/** What the database says about this enrollment and this MyCamu student. */
export interface Facts {
  /** The account already confirmed as this MyCamu student, if any. */
  byStu: string | null;
  /** The account confirmed with this enrollment, and as which MyCamu student. */
  byEnr: { user: string; stuId: string } | null;
  /** The account whose username is this enrollment right now (confirmed or not). */
  nameHolder: string | null;
}

export type Plan =
  | { do: "done" }
  | { do: "refuse"; code: "already_linked" | "conflict" | "exists_unverified" }
  | { do: "take"; renameHolder: string | null };

/**
 * The rules, in one place:
 * - one MyCamu student ↔ one DockIn account: a second account is refused;
 * - an enrollment confirmed by a different MyCamu student is a dispute for the team;
 * - an unconfirmed account sitting on this enrollment loses the name when the
 *   real student confirms (it is renamed "unverified-…", nothing is deleted) —
 *   except at sign-up, where it may be the student's own old account, so they
 *   are asked to sign in to it instead.
 */
export function plan(f: Facts, caller: string | null, signup: boolean): Plan {
  if (f.byStu && f.byStu !== caller) return { do: "refuse", code: "already_linked" };
  if (f.byStu && f.byStu === caller) return { do: "done" };
  if (f.byEnr && f.byEnr.user !== caller) return { do: "refuse", code: "conflict" };
  if (f.nameHolder && f.nameHolder !== caller) {
    if (signup) return { do: "refuse", code: "exists_unverified" };
    return { do: "take", renameHolder: f.nameHolder };
  }
  return { do: "take", renameHolder: null };
}

export function serviceClient(): SupabaseClient | null {
  if (!URL || !SERVICE) return null;
  return createClient(URL, SERVICE, { auth: { persistSession: false } });
}

/** The signed-in caller (from the app's access token), or null. */
export async function callerId(req: Request): Promise<string | null> {
  if (!URL || !ANON) return null;
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await createClient(URL, ANON, { auth: { persistSession: false } }).auth.getUser(jwt);
  return data.user?.id ?? null;
}

async function facts(sb: SupabaseClient, c: Claim): Promise<Facts> {
  const [stu, enr, holder] = await Promise.all([
    sb.from("identities").select("user_id").eq("camu_stu_id", c.stuId).maybeSingle(),
    sb.from("identities").select("user_id,camu_stu_id").eq("enrollment", c.enrollment).maybeSingle(),
    sb.rpc("identity_user_by_email", { p_email: emailOf(c.enrollment) }),
  ]);
  for (const r of [stu, enr, holder]) if (r.error) throw new Error(r.error.message);
  return {
    byStu: (stu.data?.user_id as string | undefined) ?? null,
    byEnr: enr.data ? { user: enr.data.user_id as string, stuId: enr.data.camu_stu_id as string } : null,
    nameHolder: (holder.data as string | null) ?? null,
  };
}

const MESSAGES = {
  already_linked: (e: string) => `This MyCamu is already linked to the DockIn account ${e}. Sign in to that one with its password.`,
  conflict: (e: string) => `${e} is already confirmed by another MyCamu account. The DockIn team has been told and will sort it out.`,
  exists_unverified: (e: string) =>
    `A DockIn account named ${e} already exists. If it's yours, sign in with its password — DockIn will confirm it with MyCamu. If it isn't, tap "It's not mine".`,
};

async function event(sb: SupabaseClient, kind: string, enrollment: string, user: string | null, other: string | null, detail: object = {}) {
  await sb.from("identity_events").insert({ kind, enrollment, user_id: user, other_user: other, detail });
}

/** Moves an unconfirmed account off this enrollment; returns its new username. */
async function renameHolder(sb: SupabaseClient, holder: string, c: Claim, by: string | null): Promise<string> {
  const name = `unverified-${randomBytes(3).toString("hex")}`;
  const { error } = await sb.auth.admin.updateUserById(holder, { email: emailOf(name), email_confirm: true });
  if (error) throw new Error(error.message);
  await event(sb, "renamed_holder", c.enrollment, by, holder, { new_username: name });
  return name;
}

async function bind(sb: SupabaseClient, user: string, c: Claim) {
  const { error } = await sb.from("identities").upsert({ user_id: user, enrollment: c.enrollment, camu_stu_id: c.stuId, camu_name: c.name || null, verified_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await event(sb, "verified", c.enrollment, user, null);
}

/** A signed-in student confirms who they are; their username becomes the enrollment. */
export async function claim(sb: SupabaseClient, me: string, c: Claim): Promise<Outcome> {
  const f = await facts(sb, c);
  const p = plan(f, me, false);
  if (p.do === "refuse") {
    await event(sb, p.code === "conflict" ? "conflict" : "already_linked", c.enrollment, me, p.code === "conflict" ? f.byEnr!.user : f.byStu, { stu: c.stuId });
    return { ok: false, code: p.code, message: MESSAGES[p.code === "exists_unverified" ? "conflict" : p.code](c.enrollment), username: c.enrollment };
  }
  if (p.do === "done") {
    // Already confirmed: make sure the username is the enrollment.
    await sb.auth.admin.updateUserById(me, { email: emailOf(c.enrollment), email_confirm: true });
    return { ok: true, username: c.enrollment };
  }
  const renamed = p.renameHolder ? await renameHolder(sb, p.renameHolder, c, me) : undefined;
  const { error } = await sb.auth.admin.updateUserById(me, { email: emailOf(c.enrollment), email_confirm: true });
  if (error) throw new Error(error.message);
  await bind(sb, me, c);
  return { ok: true, username: c.enrollment, renamed };
}

/**
 * A new account, made from a MyCamu sign-in: the username is the enrollment,
 * the password is theirs. `notMine` takes the name back from an unconfirmed
 * account that isn't theirs.
 */
export async function signup(sb: SupabaseClient, c: Claim, password: string, notMine: boolean): Promise<Outcome> {
  if (password.length < 6) return { ok: false, code: "weak_password", message: "Password needs at least 6 characters." };
  const f = await facts(sb, c);
  let p = plan(f, null, !notMine);
  if (p.do === "refuse" && p.code === "exists_unverified" && notMine) p = { do: "take", renameHolder: f.nameHolder };
  if (p.do === "refuse") {
    if (p.code !== "exists_unverified")
      await event(sb, p.code === "conflict" ? "conflict" : "already_linked", c.enrollment, null, p.code === "conflict" ? f.byEnr!.user : f.byStu, { stu: c.stuId });
    return { ok: false, code: p.code, message: MESSAGES[p.code](c.enrollment), username: c.enrollment };
  }
  const renamed = p.do === "take" && p.renameHolder ? await renameHolder(sb, p.renameHolder, c, null) : undefined;
  const { data, error } = await sb.auth.admin.createUser({ email: emailOf(c.enrollment), password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message ?? "could not create the account");
  await bind(sb, data.user.id, c);
  return { ok: true, username: c.enrollment, renamed };
}
