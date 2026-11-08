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

/**
 * Username + password, backed by Supabase. There is no email to confirm or a
 * code to wait for: the username becomes a private address Supabase stores the
 * account under. Nothing is deleted — signing in only adds this device to the
 * same account and syncs the data that is already on the phone.
 *
 * Needs "Confirm email" turned OFF in Supabase → Authentication → Providers →
 * Email (there is no real inbox to confirm).
 */
/** The username to show for an account — the bare name for a username login,
 * the email for an older email/OAuth account. */
export function accountName(email: string | undefined | null): string {
  if (!email) return "Signed in";
  return email.endsWith("@dockin.app") ? email.slice(0, -"@dockin.app".length) : email;
}

export function usernameEmail(username: string): string {
  const u = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${u}@dockin.app`;
}

export async function signInWithUsername(username: string, password: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  if (username.trim().length < 3) return "Username needs at least 3 characters.";
  const { error } = await sb.auth.signInWithPassword({ email: usernameEmail(username), password });
  if (!error) return null;
  if (network(error.message)) return "No internet right now.";
  if (/Invalid login credentials/i.test(error.message)) return "Wrong username or password.";
  if (/Email not confirmed/i.test(error.message))
    return "Turn off \"Confirm email\" in Supabase to use usernames.";
  return error.message;
}

export async function signUpWithUsername(username: string, password: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  if (username.trim().length < 3) return "Username needs at least 3 characters.";
  if (password.length < 6) return "Password needs at least 6 characters.";
  const { data, error } = await sb.auth.signUp({ email: usernameEmail(username), password });
  if (error) {
    if (network(error.message)) return "No internet right now.";
    if (/already registered|already exists|User already/i.test(error.message))
      return "That username is taken. Sign in instead, or pick another.";
    return error.message;
  }
  // With confirmation off, signUp returns a session straight away. Otherwise try
  // to sign in (works once confirmation is off) and guide if it still can't.
  if (!data.session) {
    const err = await signInWithUsername(username, password);
    if (err) return "Account made. Turn off \"Confirm email\" in Supabase, then sign in.";
  }
  return null;
}

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

/**
 * Emails a six-digit code to set or reset a password — the in-app path.
 *
 * A link cannot be used here: inside the Android app the email opens in a
 * separate browser, and the sign-in it does there never reaches the app. A code
 * is typed back into this screen, so the session is created where it is needed.
 * `shouldCreateUser` means the same flow is the first sign-in for a brand-new
 * email and the "forgot password" for an old one.
 */
export async function sendEmailCode(email: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { error } = await sb.auth.signInWithOtp({
    email: clean(email),
    options: { shouldCreateUser: true },
  });
  if (!error) return null;
  if (network(error.message)) return "No internet right now.";
  if (!matchesAllowedDomain(email)) return `Use your college email (@${ALLOWED_DOMAIN}).`;
  if (/rate limit|too many|after \d+ seconds/i.test(error.message))
    return "Too many codes asked for. Wait a minute and try again.";
  if (/database error|P0001/i.test(error.message))
    return ALLOWED_DOMAIN ? `Only @${ALLOWED_DOMAIN} accounts can use DockIn.` : "That email cannot be used.";
  return error.message;
}

/** Checks the six-digit code and, on success, signs the person in on this device. */
export async function verifyEmailCode(email: string, token: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { error } = await sb.auth.verifyOtp({ email: clean(email), token: token.trim(), type: "email" });
  if (!error) return null;
  if (network(error.message)) return "No internet right now.";
  if (/expired|invalid|incorrect|token/i.test(error.message))
    return "That code did not work. Check it, or ask for a new one.";
  return error.message;
}

/** Sets a new password for whoever is signed in right now (after a code, or from Settings). */
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
    return "Your session timed out. Ask for a fresh code.";
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
  // Local scope clears this device's session straight away with no server
  // round-trip, so logging out never hangs on the network — the welcome screen
  // comes up at once instead of after a wait.
  await getSupabase()?.auth.signOut({ scope: "local" });
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
