"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ALLOWED_DOMAIN, SUPABASE_URL, getSupabase, isCloudConfigured } from "./supabase";

export interface AuthState {
  session: Session | null;
  /** True until we know whether someone is signed in. */
  loading: boolean;
  configured: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<{ session: Session | null; loading: boolean }>({
    session: null,
    loading: isCloudConfigured,
  });

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (alive) setState({ session: data.session, loading: false });
    });
    const { data } = sb.auth.onAuthStateChange((_e, session) => {
      if (alive) setState({ session, loading: false });
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { ...state, configured: isCloudConfigured };
}

/**
 * Which of Supabase's sign-in buttons are actually switched on for this project.
 * Asking the server means the screen never offers a button that errors out, and
 * a provider turned on later appears without a new release.
 */
export interface Providers {
  google: boolean;
  azure: boolean;
}

export async function fetchProviders(): Promise<Providers> {
  const url = SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return { google: false, azure: false };
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const j = (await r.json()) as { external?: Record<string, boolean> };
    return { google: !!j.external?.google, azure: !!j.external?.azure };
  } catch {
    return { google: false, azure: false };
  }
}

export async function signInWithAzure(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { error } = await sb.auth.signInWithOAuth({
    provider: "azure",
    options: { redirectTo: `${window.location.origin}/`, scopes: "email openid profile" },
  });
  return error ? error.message : null;
}

export async function signInWithGoogle(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: "select_account" } },
  });
  return error ? error.message : null;
}

/** Only used to word an error better; the database decides who may sign up. */
export const matchesAllowedDomain = (email: string) =>
  !ALLOWED_DOMAIN || email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

const clean = (email: string) => email.trim().toLowerCase();
const network = (m: string) => /Failed to fetch|NetworkError|fetch failed/i.test(m);

/** Signs in with an email and password. Returns an error to show, or null on success. */
export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { error } = await sb.auth.signInWithPassword({ email: clean(email), password });
  if (!error) return null;
  if (network(error.message)) return "No internet right now.";
  if (/Invalid login credentials/i.test(error.message))
    return "Wrong email or password. Forgot it? Tap below.";
  if (/Email not confirmed/i.test(error.message))
    return "Check your inbox and confirm your email first, then sign in.";
  return error.message;
}

export interface SignUpResult {
  error: string | null;
  /** True when the account was made but needs an email confirmation before it can sign in. */
  needsConfirm: boolean;
}

/** Makes a new account with a password. Logs straight in unless the project asks for email confirmation. */
export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const sb = getSupabase();
  if (!sb) return { error: "Cloud sync is not set up.", needsConfirm: false };
  if (password.length < 6) return { error: "Use at least 6 characters for the password.", needsConfirm: false };
  const { data, error } = await sb.auth.signUp({
    email: clean(email),
    password,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) {
    if (network(error.message)) return { error: "No internet right now.", needsConfirm: false };
    if (!matchesAllowedDomain(email)) return { error: `Use your college email (@${ALLOWED_DOMAIN}).`, needsConfirm: false };
    if (/already registered|already been registered/i.test(error.message))
      return { error: "That email already has an account. Sign in, or tap “Forgot password”.", needsConfirm: false };
    if (/database error|P0001/i.test(error.message))
      return {
        error: ALLOWED_DOMAIN ? `Only @${ALLOWED_DOMAIN} accounts can use DockIn.` : "That email cannot sign up.",
        needsConfirm: false,
      };
    return { error: error.message, needsConfirm: false };
  }
  // A session means they are in now; no session but a user means confirmation is on.
  return { error: null, needsConfirm: !data.session };
}

/** Sends the "set a new password" email. The link opens /reset in the browser. */
export async function sendPasswordReset(email: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { error } = await sb.auth.resetPasswordForEmail(clean(email), {
    redirectTo: `${window.location.origin}/reset`,
  });
  if (!error) return null;
  if (network(error.message)) return "No internet right now.";
  if (/rate limit|too many/i.test(error.message)) return "Too many tries. Wait a few minutes.";
  return error.message;
}

/** Sets a new password for whoever is signed in right now (the reset link, or Settings). */
export async function updatePassword(password: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  if (password.length < 6) return "Use at least 6 characters.";
  const { error } = await sb.auth.updateUser({ password });
  if (!error) return null;
  if (network(error.message)) return "No internet right now.";
  if (/should be different|same.*password/i.test(error.message))
    return "That is the same as your old password. Pick a new one.";
  if (/Auth session missing|not authenticated/i.test(error.message))
    return "This reset link has expired. Ask for a new one.";
  return error.message;
}

/**
 * Whether Supabase is mid password-reset: the email link lands with a recovery
 * session and fires PASSWORD_RECOVERY. The /reset page waits on this before it
 * lets a new password be set, so a normal visit to /reset cannot change one.
 */
export function onPasswordRecovery(fn: () => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  // If the link was already parsed before this mounted, the hash still says so.
  if (typeof window !== "undefined" && /type=recovery/.test(window.location.hash)) {
    queueMicrotask(fn);
  }
  const { data } = sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") fn();
  });
  return () => data.subscription.unsubscribe();
}

export async function signOutCloud(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

/** A sign-in error that Supabase put in the address after redirecting back (e.g. wrong email domain). */
export function readAuthRedirectError(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const desc = q.get("error_description") ?? h.get("error_description");
  if (!desc) return null;
  if (/database error|P0001|cannot sign up/i.test(desc))
    return ALLOWED_DOMAIN
      ? `Only @${ALLOWED_DOMAIN} accounts can use DockIn. Sign in with your college email.`
      : "That account cannot sign up for DockIn.";
  return desc.replace(/\+/g, " ");
}
