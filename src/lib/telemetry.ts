"use client";

import { useSyncExternalStore } from "react";
import { DockIn, isNativeApp } from "./native";
import { getSupabase } from "./supabase";

/**
 * What DockIn Admin learns about how DockIn is used: named events with a few
 * small enum values (never free text, never what a student wrote), batched and
 * kept on the phone until they can be sent. Plus the two things the admin can
 * push back: kill-switches (flags) and "this notification was opened".
 *
 * Event names in use — keep the dashboard (admin_features) in step:
 *   outpass.made {kind: dayout|leave, via: direct|local}
 *   outpass.sent {ok, code?}        straight-to-MyCamu send result
 *   outpass.approve {ok, why?}      self-approval result
 *   outpass.cancel {ok}
 *   outpass.voice                   mic used to fill a pass
 *   outpass.mail {how: open|copy}   warden mail used
 *   lms.submit {ok, reason?}
 *   camu.connect {ok}
 *   notif.open
 */

const QUEUE = "dockin-events";
const MAX_QUEUE = 200;

type Scalar = string | number | boolean;
interface Ev {
  name: string;
  at: string;
  props?: Record<string, Scalar>;
}

function read(): Ev[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE) || "[]");
    return Array.isArray(raw) ? (raw as Ev[]) : [];
  } catch {
    return [];
  }
}

function write(q: Ev[]) {
  try {
    localStorage.setItem(QUEUE, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    /* private mode or full: events are best-effort */
  }
}

let timer = 0;
let flushing = false;
let meta: { platform: string; version: string } | null = null;

async function where(): Promise<{ platform: string; version: string }> {
  if (meta) return meta;
  let version = "web";
  if (isNativeApp()) {
    try {
      version = (await DockIn.status()).version || "app";
    } catch {
      version = "app";
    }
  }
  meta = { platform: isNativeApp() ? "android" : "web", version: version.slice(0, 30) };
  return meta;
}

/** Records one thing a student did. Cheap and safe to call anywhere; never throws. */
export function track(name: string, props?: Record<string, Scalar | null | undefined>): void {
  if (typeof window === "undefined") return;
  if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(name) || name.length > 40) return;
  const clean: Record<string, Scalar> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined) continue;
    clean[k] = typeof v === "string" ? v.slice(0, 40) : v;
  }
  const q = read();
  q.push({ name, at: new Date().toISOString(), ...(Object.keys(clean).length ? { props: clean } : {}) });
  write(q);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void flushEvents(), q.length >= 20 ? 0 : 8000);
}

/** Sends what is waiting, 50 at a time. Kept for later if offline or signed out. */
export async function flushEvents(): Promise<void> {
  if (flushing || typeof window === "undefined") return;
  const sb = getSupabase();
  if (!sb) return;
  flushing = true;
  try {
    if (!(await sb.auth.getSession()).data.session) return;
    const { platform, version } = await where();
    for (let round = 0; round < 4; round++) {
      const q = read();
      if (!q.length) return;
      const batch = q.slice(0, 50);
      const { error } = await sb.rpc("track_events", { p_events: batch, p_platform: platform, p_version: version });
      if (error) {
        // The table isn't there yet (migration not run): drop rather than pile up forever.
        if (/track_events|does not exist|schema cache/i.test(error.message)) write([]);
        return;
      }
      // Remove exactly what was sent; anything tracked meanwhile stays.
      write(read().slice(batch.length));
    }
  } catch {
    /* offline: next time */
  } finally {
    flushing = false;
  }
}

/** Flush when DockIn goes to the background and when it comes back online. */
export function startTelemetry(): () => void {
  const onHide = () => document.visibilityState === "hidden" && void flushEvents();
  const onOnline = () => void flushEvents();
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("online", onOnline);
  const first = window.setTimeout(() => void flushEvents(), 6000);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("online", onOnline);
    window.clearTimeout(first);
  };
}

// ---------------------------------------------------------------- notification opens

const openedIds = new Set<string>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A DockIn Admin notification opens its screen with `?n=<id>`. Report the open
 * (once) and hand back the path without the tag, so it never shows in the app.
 */
export function takeBroadcastOpen(path: string): string {
  try {
    const u = new URL(path, "https://x.invalid");
    const id = u.searchParams.get("n");
    if (!id) return path;
    u.searchParams.delete("n");
    if (UUID.test(id) && !openedIds.has(id)) {
      openedIds.add(id);
      const sb = getSupabase();
      void sb?.rpc("broadcast_opened", { p_id: id }).then(() => {}, () => {});
      track("notif.open");
    }
    return u.pathname + u.search + u.hash;
  } catch {
    return path;
  }
}

// ---------------------------------------------------------------- kill-switches

export type FlagName = "outpass" | "self_approval" | "lms_submit" | "voice";
export type Flags = Record<FlagName, boolean>;

const ON: Flags = { outpass: true, self_approval: true, lms_submit: true, voice: true };
const FLAGS_KEY = "dockin-flags";
const listeners = new Set<() => void>();
let current: Flags = ON;
let loadedAt = 0;

try {
  if (typeof window !== "undefined") current = { ...ON, ...(JSON.parse(localStorage.getItem(FLAGS_KEY) || "{}") as Partial<Flags>) };
} catch {
  /* defaults */
}

async function loadFlags(): Promise<void> {
  if (Date.now() - loadedAt < 5 * 60_000) return;
  loadedAt = Date.now();
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb.from("app_config").select("value").eq("key", "flags").maybeSingle();
  if (error) return;
  const v = (data?.value ?? {}) as Partial<Record<FlagName, unknown>>;
  const next: Flags = { ...ON };
  for (const k of Object.keys(ON) as FlagName[]) if (typeof v[k] === "boolean") next[k] = v[k] as boolean;
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  try {
    localStorage.setItem(FLAGS_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((f) => f());
}

/** The admin's switches, live (checked on start, on return to the app, every 5 min). Everything is on unless switched off. */
export function useFlags(): Flags {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      void loadFlags().catch(() => {});
      const onVis = () => document.visibilityState === "visible" && void loadFlags().catch(() => {});
      document.addEventListener("visibilitychange", onVis);
      const t = window.setInterval(() => void loadFlags().catch(() => {}), 5 * 60_000);
      return () => {
        listeners.delete(f);
        document.removeEventListener("visibilitychange", onVis);
        window.clearInterval(t);
      };
    },
    () => current,
    () => ON,
  );
}

/** The current switches outside React. */
export const flagsNow = (): Flags => current;
