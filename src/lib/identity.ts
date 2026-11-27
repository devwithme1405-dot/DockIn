"use client";

import { useEffect, useState } from "react";
import { DockIn, isNativeApp } from "./native";
import { getSupabase } from "./supabase";
import { signInWithUsername } from "./auth";

/**
 * "Your DockIn username is your enrollment number." The enrollment and MyCamu's
 * student id come from the student's own MyCamu sign-in on this phone; the
 * server (/api/identity/*) decides what happens to the username.
 */

export interface CamuIdentity {
  enrollment: string;
  stuId: string;
  /** As MyCamu has it, e.g. "SACHIN KUMAR". */
  name: string;
}

export type IdentityResult =
  | { ok: true; username: string; renamed?: string }
  | { ok: false; code: string; message: string; username?: string };

/** "SACHIN KUMAR" → "Sachin" — a starting point for the nickname. */
export function firstName(full: string): string {
  const w = full.trim().split(/\s+/)[0] ?? "";
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "";
}

/**
 * Who MyCamu says this student is. With `connect`, opens MyCamu's sign-in when
 * it isn't connected yet (or was connected before DockIn read the enrollment).
 */
export async function readCamuIdentity(connect: boolean): Promise<CamuIdentity | { error: string }> {
  if (!isNativeApp()) return { error: "MyCamu sign-in works in the DockIn app. Download it to continue." };
  const read = async () => {
    const r = await DockIn.camuIdentity();
    return r.connected && r.enrollment && r.stuId ? { enrollment: r.enrollment, stuId: r.stuId, name: r.name } : null;
  };
  try {
    const now = await read();
    if (now || !connect) return now ?? { error: "Sign in to MyCamu first." };
  } catch {
    return { error: "Update the DockIn app to continue — this needs the newest version." };
  }
  try {
    await DockIn.connectCamu();
  } catch {
    return { error: "MyCamu sign-in didn't finish. Try again." };
  }
  const after = await read().catch(() => null);
  return after ?? { error: "MyCamu didn't show your enrollment number. Try again, or tell the DockIn team." };
}

async function post(path: string, body: unknown, token?: string): Promise<IdentityResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as IdentityResult | null;
    return j ?? { ok: false, code: "server", message: `DockIn's server said ${res.status}.` };
  } catch {
    return { ok: false, code: "network", message: "No internet right now." };
  }
}

/** A new account: username = enrollment, then signed in with the chosen password. */
export async function signUpWithCamu(id: CamuIdentity, password: string, notMine = false): Promise<IdentityResult> {
  const r = await post("/api/identity/signup", { ...id, password, notMine });
  if (!r.ok) return r;
  const err = await signInWithUsername(r.username, password);
  if (err) return { ok: false, code: "signin", message: `Account made, but signing in failed: ${err}` };
  rememberCamuName(id.name);
  return r;
}

/** The signed-in account is confirmed as this MyCamu student; its username becomes the enrollment. */
export async function claimWithCamu(id: CamuIdentity): Promise<IdentityResult> {
  const sb = getSupabase();
  const token = sb ? (await sb.auth.getSession()).data.session?.access_token : undefined;
  if (!sb || !token) return { ok: false, code: "signin", message: "Sign in again." };
  const r = await post("/api/identity/claim", id, token);
  if (r.ok) {
    // The new username lives in the account's email: pick it up now.
    await sb.auth.refreshSession().catch(() => {});
    rememberVerified(true);
    rememberCamuName(id.name);
  }
  return r;
}

const NAME_KEY = "dockin-camu-name";
function rememberCamuName(n: string) {
  try {
    if (n) sessionStorage.setItem(NAME_KEY, n);
  } catch {
    /* fine */
  }
}
/** The MyCamu name from this session's sign-up, to start the nickname from. */
export function camuNameHint(): string {
  try {
    return sessionStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

const VERIFIED_KEY = "dockin-identity";
function rememberVerified(v: boolean) {
  try {
    localStorage.setItem(VERIFIED_KEY, v ? "1" : "0");
  } catch {
    /* fine */
  }
}

/**
 * Is the signed-in account confirmed with MyCamu? "unknown" until the server
 * answers (and when it can't — the gate never locks anyone out on its own error).
 */
export function useIdentityStatus(userId: string | null, enabled: boolean): "unknown" | "verified" | "needed" {
  const [state, setState] = useState<{ for: string | null; v: "unknown" | "verified" | "needed" }>({ for: null, v: "unknown" });
  useEffect(() => {
    if (!enabled || !userId) return;
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    const check = () =>
      void sb
        .from("identities")
        .select("enrollment")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!alive) return;
          if (error) return setState({ for: userId, v: "unknown" });
          rememberVerified(!!data);
          setState({ for: userId, v: data ? "verified" : "needed" });
        });
    check();
    const again = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", again);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", again);
    };
  }, [userId, enabled]);
  return state.for === userId ? state.v : "unknown";
}
