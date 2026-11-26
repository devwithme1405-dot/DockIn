"use client";

import { useEffect, useState } from "react";
import { collegeNow } from "./college";
import { DockIn, isNativeApp } from "./native";
import { getSupabase } from "./supabase";

/**
 * What DockIn Admin knows about each student: that they opened the app, on
 * which version and platform, and whether setup is healthy (Camu / LMS
 * connected, notifications on). Never attendance, messages or anything else
 * they keep in DockIn. Sent on open and every half hour the app stays open.
 */
async function report(): Promise<void> {
  const sb = getSupabase();
  if (!sb || !(await sb.auth.getSession()).data.session) return;
  const native = isNativeApp();
  let version = "web";
  let notif: string | null = typeof Notification !== "undefined" ? Notification.permission : null;
  if (native) {
    try {
      const s = await DockIn.status();
      version = s.version || "app";
      notif = s.notifications ?? notif;
    } catch {
      version = "app";
    }
  }
  let channel = "stable";
  try {
    if (localStorage.getItem("dockin-channel") === "preview") channel = "preview";
  } catch {}
  const col = collegeNow();
  await sb.rpc("seen", {
    p_platform: native ? "android" : "web",
    p_version: version,
    p_channel: channel,
    p_camu: native ? !!col.camu?.connected : null,
    p_lms: native ? !!col.lms?.connected : null,
    p_notif: notif,
  });
}

export function startPresence(): () => void {
  let last = 0;
  const go = () => {
    if (document.visibilityState !== "visible" || Date.now() - last < 25 * 60_000) return;
    last = Date.now();
    void report().catch(() => {
      last = 0; // try again on the next visit
    });
  };
  // A little after start, so the first screen and the sync come first.
  const first = window.setTimeout(go, 4000);
  const every = window.setInterval(go, 30 * 60_000);
  document.addEventListener("visibilitychange", go);
  return () => {
    window.clearTimeout(first);
    window.clearInterval(every);
    document.removeEventListener("visibilitychange", go);
  };
}

// ---------------------------------------------------------------- crashes

let sent = 0;
const seenErrors = new Set<string>();

/** Uncaught errors go to DockIn Admin (at most 8 a session, each once). */
export function installErrorReports(): () => void {
  const send = (message: string, source: string) => {
    const msg = message.slice(0, 300);
    if (!msg || sent >= 8 || seenErrors.has(msg)) return;
    if (/ResizeObserver loop|Script error\.?$|Load failed|NetworkError|Failed to fetch|AbortError/i.test(msg)) return;
    seenErrors.add(msg);
    sent++;
    const sb = getSupabase();
    if (!sb) return;
    void (async () => {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user.id;
      if (!user) return;
      let version = "web";
      try {
        version = isNativeApp() ? (await DockIn.status()).version || "app" : "web";
      } catch {}
      await sb.from("client_errors").insert({ user_id: user, message: msg, source: `${location.pathname} ${source}`.slice(0, 200), version: version.slice(0, 30) });
    })().catch(() => {});
  };
  const onError = (e: ErrorEvent) => send(e.message || String(e.error ?? ""), `${(e.filename ?? "").split("/").pop()}:${e.lineno ?? ""}`);
  const onReject = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string } | string | undefined;
    send(typeof r === "string" ? r : (r?.message ?? ""), "promise");
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onReject);
  };
}

// ---------------------------------------------------------------- suspension

export interface Ban {
  reason: string;
  until: string | null;
}

/** This account's suspension, if any (checked on start and when DockIn comes back to the front). */
export function useBan(userId: string | null): Ban | null {
  const [ban, setBan] = useState<Ban | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) return;
    let alive = true;
    const check = async () => {
      const { data, error } = await sb.from("bans").select("reason,until").eq("user_id", userId).maybeSingle();
      if (!alive || error) return;
      const active = data && (!data.until || Date.parse(data.until as string) > Date.now());
      setBan(active ? { reason: (data.reason as string) || "", until: (data.until as string) ?? null } : null);
    };
    void check();
    const onVis = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId]);
  return userId ? ban : null;
}

// ---------------------------------------------------------------- announcement

export interface Announcement {
  id: string;
  text: string;
  tone?: "info" | "warn" | "good";
  link?: string;
}

/** The founder's banner for everyone (Today screen), if one is set. */
export function useAnnouncement(): Announcement | null {
  const [a, setA] = useState<Announcement | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    const load = async () => {
      const { data } = await sb.from("app_config").select("value").eq("key", "announcement").maybeSingle();
      if (!alive) return;
      const v = (data?.value ?? null) as Partial<Announcement> | null;
      setA(v?.text && v.id ? { id: String(v.id), text: String(v.text), tone: v.tone, link: v.link } : null);
    };
    void load().catch(() => {});
    const t = window.setInterval(() => void load().catch(() => {}), 15 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return a;
}
