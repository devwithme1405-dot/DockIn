"use client";

import { getSupabase } from "./supabase";

/** DockIn Admin's calls: database functions (admins only) and the admin server routes. */

export interface Overview {
  users: number;
  new_today: number;
  new_7d: number;
  online: number;
  dau: number;
  wau: number;
  mau: number;
  seen: number;
  android: number;
  web: number;
  preview: number;
  profiles: number;
  camu: number;
  lms: number;
  notif_on: number;
  push: number;
  push_instant: number;
  with_friends: number;
  groups: number;
  messages_today: number;
  messages_7d: number;
  reports_open: number;
  banned: number;
  errors_24h: number;
  downloads: number;
  downloads_7d: number;
  versions: { v: string; n: number }[];
  series: { d: string; signups: number; active: number; messages: number; downloads: number }[];
}

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  code: string | null;
  branch: string | null;
  year: number | null;
  section: string | null;
  avatar: string | null;
  created_at: string;
  last_seen: string | null;
  opens: number | null;
  platform: string | null;
  app_version: string | null;
  channel: string | null;
  camu: boolean | null;
  lms: boolean | null;
  notifications: string | null;
  push: boolean;
  friends: number;
  reports: number;
  banned: boolean;
  ban_reason: string | null;
  ban_until: string | null;
}

export interface UserDetail {
  user: { id: string; username: string; created_at: string; last_sign_in_at: string | null } | null;
  profile: { name: string; code: string; branch: string | null; year: number | null; section: string | null; bio: string | null; avatar: string | null } | null;
  seen: { last_seen: string; first_seen: string; opens: number; platform: string | null; app_version: string | null; channel: string | null; camu: boolean | null; lms: boolean | null; notifications: string | null } | null;
  days: string[];
  phones: { platform: string; caps: string | null; updated_at: string }[];
  messages: number;
  messages_7d: number;
  friends: number;
  groups: number;
  ban: { reason: string; until: string | null; banned_at: string } | null;
  reports: { id: string; reason: string; excerpt: string; status: string; created_at: string }[];
  reported_others: number;
  errors: number;
}

export interface Report {
  id: string;
  reason: string;
  excerpt: string;
  thread: string | null;
  message_id: string | null;
  status: "open" | "dismissed" | "actioned";
  created_at: string;
  target: string;
  target_name: string;
  target_username: string;
  reporter: string;
  reporter_name: string;
  target_reports: number;
  target_banned: boolean;
}

export interface ErrorGroup {
  message: string;
  n: number;
  people: number;
  last_at: string;
  source: string;
  version: string;
}

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  path: string;
  audience: Audience;
  sent_at: string;
  people: number;
  phones: number;
  delivered: number;
}

export type Audience =
  | { kind: "all" }
  | { kind: "android" }
  | { kind: "inactive"; days: number }
  | { kind: "active"; days: number }
  | { kind: "no_camu" }
  | { kind: "version_below"; version: string }
  | { kind: "preview" }
  | { kind: "user"; userId: string }
  | { kind: "me" };

function sb() {
  const s = getSupabase();
  if (!s) throw new Error("DockIn isn't connected to its server here.");
  return s;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(error.message === "not allowed" ? "Not an admin" : error.message);
  return data as T;
}

export const adminRole = () => rpc<"owner" | "moderator" | null>("admin_role");
export const overview = () => rpc<Overview>("admin_overview");
export const users = (q: string, filter: string, limit = 50, offset = 0) =>
  rpc<{ total: number; rows: AdminUser[] }>("admin_users", { p_q: q, p_filter: filter, p_limit: limit, p_offset: offset });
export const userDetail = (id: string) => rpc<UserDetail>("admin_user", { p_id: id });
export const reports = (status: string) => rpc<Report[]>("admin_reports", { p_status: status });
export const resolveReport = (id: string, action: "dismiss" | "delete_message" | "actioned") => rpc<void>("admin_resolve_report", { p_id: id, p_action: action });
export const errors = () => rpc<ErrorGroup[]>("admin_errors");
export const broadcasts = () => rpc<Broadcast[]>("admin_broadcasts");
export const auditLog = () => rpc<{ at: string; action: string; target: string | null; detail: unknown; admin_name: string }[]>("admin_audit_log", { p_limit: 100 });
export const team = () => rpc<{ user_id: string; role: string; username: string; name: string; added_at: string }[]>("admin_team");
export const setMember = (username: string, role: "owner" | "moderator" | "none") => rpc<void>("admin_set_member", { p_username: username, p_role: role });
export const setAnnouncement = (value: Record<string, unknown>) => rpc<void>("admin_set_announcement", { p_value: value });
export async function announcement(): Promise<{ id?: string; text?: string; tone?: string; link?: string } | null> {
  const { data } = await sb().from("app_config").select("value").eq("key", "announcement").maybeSingle();
  return (data?.value as { id?: string; text?: string; tone?: string; link?: string }) ?? null;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = (await sb().auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("Sign in again");
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `Server said ${res.status}`);
  return j;
}

export const notify = (b: { title: string; body: string; path: string; audience: Audience; dryRun?: boolean }) =>
  call<{ people: number; phones: number; targeted?: number; sent?: number; failed?: number; errors?: Record<string, number> }>("/api/admin/push", b);
export const ban = (userId: string, reason: string, days: number | null) => call<{ ok: boolean; until: string | null }>("/api/admin/ban", { userId, reason, days });
export const unban = (userId: string) => call<{ ok: boolean }>("/api/admin/ban", { userId, unban: true });
export const github = () => call<{ releases: { tag: string; name: string; published: string | null; downloads: number }[] }>("/api/admin/github");

/** "5 min ago", "3 h ago", "2 d ago", or a date. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const pctOf = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** Seen within the last `mins` minutes. */
export const within = (iso: string | null | undefined, mins: number) => !!iso && Date.now() - Date.parse(iso) < mins * 60_000;
/** A suspension still running. */
export const stillBanned = (until: string | null | undefined) => !until || Date.parse(until) > Date.now();
