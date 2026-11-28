"use client";

import { getSupabase } from "./supabase";

/**
 * DockIn Admin's calls. Every number comes straight from the database
 * functions in supabase/migrations (admins only, checked again there) or from
 * the admin server routes — nothing is estimated or made up in the browser.
 */

// ------------------------------------------------------------------ shapes

export interface DayPoint {
  d: string;
  signups: number;
  active: number;
  new_active: number;
  messages: number;
  outpass: number;
  errors: number;
}

export interface Overview2 {
  at: string;
  tracking_since: string | null;
  users: number;
  verified: number;
  profiles: number;
  banned: number;
  online_5m: number;
  online_1h: number;
  signups_today: number;
  signups_yday_sofar: number;
  signups_yday: number;
  signups_7d: number;
  signups_prev7d: number;
  dau: number;
  dau_yday: number;
  wau: number;
  wau_prev: number;
  mau: number;
  avg_dau_30: number;
  seen: number;
  android: number;
  web: number;
  preview: number;
  camu: number;
  lms: number;
  notif_on: number;
  push: number;
  push_instant: number;
  messages_today: number;
  messages_7d: number;
  events_today: number;
  outpass_7d: number;
  outpass_users_7d: number;
  reports_open: number;
  errors_24h: number;
  errors_prev24h: number;
  error_users_24h: number;
  active_24h: number;
  identity_issues_7d: number;
  downloads_7d: number;
  latest_version: string | null;
  on_latest: number;
  android_30d: number;
  versions: { v: string; n: number }[];
  series: DayPoint[];
}

export interface OnlineUser {
  user_id: string;
  last_seen: string;
  platform: string | null;
  app_version: string | null;
  name: string;
  username: string;
}

export type FeedKind = "signup" | "open" | "event" | "error" | "report" | "identity" | "broadcast";
export interface FeedItem {
  at: string;
  kind: FeedKind;
  title: string | null;
  detail: Record<string, unknown> | null;
  user_id: string | null;
  name: string;
  username: string;
}
export interface Live {
  at: string;
  online: OnlineUser[];
  feed: FeedItem[];
}

export interface Growth {
  days: number;
  tracking_since: string | null;
  funnel: { signed_up: number; named: number; verified: number; camu: number; notif: number; outpass: number; active7: number };
  cohorts: { week: string; size: number; active: (number | null)[] }[];
  returns: { d1_n: number; d1: number; w1_n: number; w1: number; m1_n: number; m1: number };
  churn: { active: number; retained: number; churned: number; new_users: number; resurrected: number };
}

export interface Features {
  days: number;
  total: number;
  users: number;
  names: { name: string; n: number; users: number; last_at: string }[];
  series: { name: string; points: number[] }[];
  outpass: {
    made: number;
    dayout: number;
    leave: number;
    direct: number;
    local: number;
    sent_ok: number;
    sent_fail: number;
    approved_ok: number;
    approved_fail: number;
    cancelled: number;
    voice: number;
    mail: number;
    users: number;
    fail_codes: Record<string, number>;
  };
  lms: { ok: number; fail: number; users: number; reasons: Record<string, number> };
  notifications: { sent: number; targeted: number; delivered: number; opened: number };
}

export type SignalId = "name_mismatch" | "link_attempt" | "unverified" | "username_mismatch" | "year_mismatch" | "reported" | "spam" | "banned_before" | "ghost";
export interface Signal {
  id: SignalId;
  w: number;
  text: string;
}
export interface RiskRow {
  id: string;
  username: string;
  name: string;
  enrollment: string | null;
  camu_name: string | null;
  created_at: string;
  last_seen: string | null;
  platform: string | null;
  app_version: string | null;
  banned: boolean;
  score: number;
  signals: Signal[];
}
export interface Risk {
  checked: number;
  flagged: number;
  high: number;
  medium: number;
  by_signal: Partial<Record<SignalId, number>>;
  rows: RiskRow[];
}

export interface Student {
  id: string;
  username: string;
  created_at: string;
  last_sign_in_at: string | null;
  name: string;
  code: string | null;
  branch: string | null;
  year: number | null;
  section: string | null;
  avatar: string | null;
  enrollment: string | null;
  camu_name: string | null;
  verified_at: string | null;
  last_seen: string | null;
  first_seen: string | null;
  opens: number | null;
  platform: string | null;
  app_version: string | null;
  channel: string | null;
  camu: boolean | null;
  lms: boolean | null;
  notifications: string | null;
  push: boolean;
  push_instant: boolean;
  reports: number;
  ban_reason: string | null;
  ban_until: string | null;
  banned: boolean;
  outdated: boolean | null;
  risk: number;
}
export interface Students {
  total: number;
  latest_version: string | null;
  rows: Student[];
}

export interface User360 {
  user: { id: string; username: string; created_at: string; last_sign_in_at: string | null } | null;
  profile: { name: string; code: string; branch: string | null; year: number | null; section: string | null; bio: string | null; avatar: string | null } | null;
  identity: { enrollment: string; camu_name: string | null; camu_stu_id: string | null; verified_at: string | null } | null;
  identity_events: { at: string; kind: string; enrollment: string | null; detail: Record<string, unknown> | null }[];
  seen: {
    last_seen: string;
    first_seen: string;
    opens: number;
    platform: string | null;
    app_version: string | null;
    channel: string | null;
    camu: boolean | null;
    lms: boolean | null;
    notifications: string | null;
  } | null;
  days: string[];
  active_days_30: number;
  phones: { platform: string; caps: string | null; updated_at: string }[];
  sessions: number;
  events: { at: string; name: string; props: Record<string, unknown> | null; platform: string | null; version: string | null }[];
  event_counts: Record<string, number>;
  notifications: { delivered: number; opened: number };
  messages: number;
  messages_7d: number;
  friends: number;
  groups: number;
  ban: { reason: string; until: string | null; banned_at: string } | null;
  reports: { id: string; reason: string; excerpt: string; status: string; created_at: string }[];
  reported_others: number;
  errors: { at: string; message: string; source: string | null; version: string | null }[];
  admin: string | null;
  risk: { score: number; signals: Signal[] };
}

export interface Health2 {
  errors: {
    message: string;
    n: number;
    n24: number;
    nprev: number;
    people: number;
    last_at: string;
    first_at: string;
    source: string | null;
    version: string | null;
    versions: (string | null)[];
  }[];
  error_series: { h: string; n: number }[];
  active_24h: number;
  error_users_24h: number;
  by_version: { version: string; n: number; people: number }[];
  tokens: { total: number; people: number; instant: number; stale_30d: number };
  presence_failing: number;
}

export interface Broadcast2 {
  id: string;
  title: string;
  body: string;
  path: string;
  audience: Audience;
  sent_at: string;
  people: number;
  phones: number;
  targeted: number | null;
  instant: number | null;
  failed: number | null;
  /** Phones Google accepted the message for (not the same as arrived). */
  accepted: number;
  sent_by: string;
  /** Students whose phone confirmed the notification arrived (signed receipt). */
  reached: number;
  /** Students who tapped it. */
  opened: number;
}

export interface Segments {
  branches: { v: string; n: number }[];
  years: { v: number; n: number }[];
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

export type Audience =
  | { kind: "all" }
  | { kind: "android" }
  | { kind: "inactive"; days: number }
  | { kind: "active"; days: number }
  | { kind: "no_camu" }
  | { kind: "version_below"; version: string }
  | { kind: "outdated" }
  | { kind: "preview" }
  | { kind: "unverified" }
  | { kind: "branch"; value: string }
  | { kind: "year"; value: number }
  | { kind: "users"; ids: string[] }
  | { kind: "user"; userId: string }
  | { kind: "me" };

export type FlagName = "outpass" | "self_approval" | "lms_submit" | "voice";
export type Flags = Record<FlagName, boolean>;

// ------------------------------------------------------------------ calls

function sb() {
  const s = getSupabase();
  if (!s) throw new Error("DockIn isn't connected to its server here.");
  return s;
}

const MISSING = /could not find the function|function .* does not exist|schema cache/i;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) {
    if (error.message === "not allowed") throw new Error("Not an admin");
    if (MISSING.test(error.message)) throw new Error("The database is missing the new admin update — run migration 0031_admin_pro.sql in Supabase.");
    throw new Error(error.message);
  }
  return data as T;
}

export const adminRole = () => rpc<"owner" | "moderator" | null>("admin_role");
export const overview2 = () => rpc<Overview2>("admin_overview2");
export const live = (limit = 120) => rpc<Live>("admin_live", { p_limit: limit });
export const growth = (days = 30) => rpc<Growth>("admin_growth", { p_days: days });
export const features = (days = 30) => rpc<Features>("admin_features", { p_days: days });
export const risk = (min = 1, limit = 200) => rpc<Risk>("admin_risk", { p_min: min, p_limit: limit });
export const students = (q: string, filter: string, sort: string, limit = 50, offset = 0) =>
  rpc<Students>("admin_users2", { p_q: q, p_filter: filter, p_sort: sort, p_limit: limit, p_offset: offset });
export const user360 = (id: string) => rpc<User360>("admin_user360", { p_id: id });
export const exportStudents = () => rpc<Record<string, unknown>[]>("admin_export_users");
export const health2 = () => rpc<Health2>("admin_health2");
export const broadcasts2 = (limit = 50) => rpc<Broadcast2[]>("admin_broadcasts2", { p_limit: limit });
export const segments = () => rpc<Segments>("admin_segments");
export const setFlags = (value: Flags) => rpc<void>("admin_set_flags", { p_value: value });
export const forceSignOut = (userId: string) => rpc<number>("admin_force_signout", { p_user: userId });
export const resetIdentity = (userId: string) => rpc<void>("admin_reset_identity", { p_user: userId });

/** Enrollment usernames: how many confirmed, and every name that had to move. */
export const identitySummary = () =>
  rpc<{
    users: number;
    verified: number;
    unverified_named: number;
    events: { at: string; kind: string; enrollment: string; username: string | null; other_username: string | null; detail: Record<string, unknown> }[];
  }>("admin_identity");
export const reports = (status: string) => rpc<Report[]>("admin_reports", { p_status: status });
export const resolveReport = (id: string, action: "dismiss" | "delete_message" | "actioned") => rpc<void>("admin_resolve_report", { p_id: id, p_action: action });
export const auditLog = () => rpc<{ at: string; action: string; target: string | null; detail: unknown; admin_name: string }[]>("admin_audit_log", { p_limit: 100 });
export const team = () => rpc<{ user_id: string; role: string; username: string; name: string; added_at: string }[]>("admin_team");
export const setMember = (username: string, role: "owner" | "moderator" | "none") => rpc<void>("admin_set_member", { p_username: username, p_role: role });
export const setAnnouncement = (value: Record<string, unknown>) => rpc<void>("admin_set_announcement", { p_value: value });

async function config<T>(key: string): Promise<T | null> {
  const { data, error } = await sb().from("app_config").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as T) ?? null;
}
export const announcement = () => config<{ id?: string; text?: string; tone?: string; link?: string }>("announcement");
export async function flags(): Promise<Flags> {
  const v = (await config<Partial<Flags>>("flags")) ?? {};
  return { outpass: v.outpass !== false, self_approval: v.self_approval !== false, lms_submit: v.lms_submit !== false, voice: v.voice !== false };
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = (await sb().auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("Sign in again");
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `Server said ${res.status}`);
  return j;
}

export interface NotifyResult {
  ok?: boolean;
  id?: string;
  people: number;
  phones: number;
  targeted?: number;
  instant?: number;
  sent?: number;
  failed?: number;
  errors?: Record<string, number>;
}
export const notify = (b: { title: string; body: string; path: string; audience: Audience; dryRun?: boolean }) => call<NotifyResult>("/api/admin/push", b);
export const ban = (userId: string, reason: string, days: number | null) => call<{ ok: boolean; until: string | null }>("/api/admin/ban", { userId, reason, days });
export const unban = (userId: string) => call<{ ok: boolean }>("/api/admin/ban", { userId, unban: true });
export const serverHealth = () => call<{ checks: { id: string; label: string; ok: boolean; detail: string }[]; at: string }>("/api/admin/health");
export const github = () => call<{ releases: { tag: string; name: string; published: string | null; downloads: number }[] }>("/api/admin/github");

// ------------------------------------------------------------------ helpers

/** "5 min ago", "3 h ago", "2 d ago", or a date. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** A clock time in India, e.g. "4:05 pm". */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
/** A date in India, e.g. "28 Nov". */
export const dayLabel = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
/** Today's date in India as YYYY-MM-DD (the database counts days in IST too). */
export function istDay(offsetDays = 0): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 - offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

export const pctOf = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
/** Seen within the last `mins` minutes. */
export const within = (iso: string | null | undefined, mins: number) => !!iso && Date.now() - Date.parse(iso) < mins * 60_000;
/** A suspension still running. */
export const stillBanned = (until: string | null | undefined) => !until || Date.parse(until) > Date.now();
/** Change from `prev` to `now` in percent, or null when there is nothing to compare with. */
export const change = (now: number, prev: number): number | null => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);

/** A student list (or any rows) as a CSV file download. */
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Keep spreadsheet apps from running a cell as a formula.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const text = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** What a signal means, in a word or two (for chips and filters). */
export const SIGNAL_LABEL: Record<SignalId, string> = {
  name_mismatch: "Name ≠ MyCamu",
  link_attempt: "Used someone else's ID",
  unverified: "Not verified",
  username_mismatch: "Username ≠ enrollment",
  year_mismatch: "Wrong year",
  reported: "Reported",
  spam: "Spamming",
  banned_before: "Suspended before",
  ghost: "Never opened",
};

/** Readable names for the product events the app records. */
export const EVENT_LABEL: Record<string, string> = {
  "outpass.made": "Outpass made",
  "outpass.sent": "Outpass sent to MyCamu",
  "outpass.approve": "Self-approval",
  "outpass.cancel": "Outpass cancelled",
  "outpass.voice": "Outpass by voice",
  "outpass.mail": "Warden mail",
  "lms.submit": "LMS hand-in",
  "camu.connect": "MyCamu connect",
  "notif.open": "Notification opened",
};
export const eventLabel = (n: string) => EVENT_LABEL[n] ?? n;

/** Describes an audience in plain words. */
export function audienceLabel(a: Audience | null | undefined): string {
  if (!a) return "—";
  switch (a.kind) {
    case "all":
      return "Everyone";
    case "android":
      return "Android app";
    case "active":
      return `Active in ${a.days}d`;
    case "inactive":
      return `Away ${a.days}d+`;
    case "no_camu":
      return "No MyCamu";
    case "version_below":
      return `Below v${a.version}`;
    case "outdated":
      return "Old app version";
    case "preview":
      return "Preview testers";
    case "unverified":
      return "Not verified";
    case "branch":
      return a.value;
    case "year":
      return `Year ${a.value}`;
    case "users":
      return `${a.ids.length} picked`;
    case "user":
      return "One student";
    case "me":
      return "Just me";
  }
}
