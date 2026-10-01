"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ALLOWED_DOMAIN, getSupabase, isCloudConfigured } from "./supabase";

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

export async function signInWithGoogle(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: "select_account" } },
  });
  return error ? error.message : null;
}

export const isBennettEmail = (email: string) =>
  email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

export async function sendEmailCode(email: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (!error) return null;
  if (!isBennettEmail(email)) return `Use your Bennett email (@${ALLOWED_DOMAIN}).`;
  if (/rate limit/i.test(error.message)) return "Too many emails sent. Wait a few minutes, or use Google sign-in.";
  return error.message;
}

export async function verifyEmailCode(email: string, token: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { error } = await sb.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  return error ? "That code did not work. Check it and try again." : null;
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
  if (/database error|bennett|P0001/i.test(desc))
    return `Only Bennett accounts (@${ALLOWED_DOMAIN}) can use DockIn. Sign in with your college email.`;
  return desc.replace(/\+/g, " ");
}
