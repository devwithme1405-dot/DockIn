"use client";

import { PushNotifications } from "@capacitor/push-notifications";
import { getSupabase } from "./supabase";
import { isNativeApp } from "./native";

/**
 * Push notifications (Firebase Cloud Messaging).
 *
 * The phone registers once and stores its token in `push_tokens` (owner-only).
 * When you send a message, share a task or add a friend, the app asks our own
 * server route (/api/push) to tell the people it concerns; the server checks
 * you are allowed to, looks up their tokens with the service role, and sends.
 */

export type PushEvent =
  | { type: "test" }
  | { type: "message"; id: string }
  | { type: "share"; id: string }
  | { type: "friend"; to: string }
  | { type: "friend"; code: string };

/** Fire-and-forget: a missed notification must never break the action itself. */
export function notifyPush(event: PushEvent): void {
  const sb = getSupabase();
  if (!sb) return;
  void sb.auth
    .getSession()
    .then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      return fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(event),
        keepalive: true,
      });
    })
    .catch(() => {});
}

let started = false;
let listening = false;
let lastOpen: (path: string) => void = () => {};

/** What the last registration attempt said — shown on the notification test. */
export function pushDiagnostics(): { token: boolean; error: string | null } {
  try {
    return { token: !!localStorage.getItem("dockin-push-token"), error: localStorage.getItem("dockin-push-error") };
  } catch {
    return { token: false, error: null };
  }
}

/**
 * Registers this phone for push and keeps its token current. Tapping a
 * notification opens the screen it is about (`data.path`). Safe to call again
 * (on every app resume): it only does work until the phone is registered, so a
 * permission granted later in Settings still gets this phone its pushes.
 */
export async function startPush(open: (path: string) => void): Promise<void> {
  lastOpen = open;
  if (started || !isNativeApp()) return;
  started = true;
  try {
    await PushNotifications.createChannel({
      id: "social",
      name: "Friends & groups",
      description: "Messages, shared tasks and friend requests",
      importance: 4,
      visibility: 1,
    }).catch(() => {});

    if (!listening) {
      listening = true;
      await PushNotifications.addListener("registration", async ({ value }) => {
        try {
          localStorage.setItem("dockin-push-token", value);
          localStorage.removeItem("dockin-push-error");
        } catch {
          /* only used to forget it on logout */
        }
        const sb = getSupabase();
        if (!sb) return;
        const { data } = await sb.auth.getUser();
        if (!data.user) return;
        const { error } = await sb.from("push_tokens").upsert({ token: value, user_id: data.user.id, updated_at: new Date().toISOString() });
        if (error) {
          try {
            localStorage.setItem("dockin-push-error", `save: ${error.message}`);
          } catch {
            /* fine */
          }
        }
      });
      await PushNotifications.addListener("registrationError", ({ error }) => {
        started = false;
        try {
          localStorage.setItem("dockin-push-error", `register: ${error}`);
        } catch {
          /* fine */
        }
      });
      await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const path = (notification.data as { path?: string } | undefined)?.path;
        if (path && path.startsWith("/")) lastOpen(path);
      });
    }

    // The asking itself happens once, in NotifyAsk — never a second dialog here.
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      // Try again on the next resume — the person may switch it on in Settings.
      started = false;
      return;
    }
    await PushNotifications.register();
  } catch (e) {
    // A build without Firebase config throws here; the app works without push.
    started = false;
    try {
      localStorage.setItem("dockin-push-error", `start: ${e instanceof Error ? e.message : String(e)}`);
    } catch {
      /* fine */
    }
  }
}

/** Makes sure this phone's token is saved for the signed-in account (e.g. it registered before sign-in). */
export async function syncPushToken(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem("dockin-push-token");
  } catch {
    return;
  }
  const sb = getSupabase();
  if (!token || !sb) return;
  const { data } = await sb.auth.getUser();
  if (!data.user) return;
  await sb.from("push_tokens").upsert({ token, user_id: data.user.id, updated_at: new Date().toISOString() });
}

/** Asks the server to send this phone a test notification; says what happened. */
export async function testPush(): Promise<string> {
  const sb = getSupabase();
  if (!sb) return "Cloud sync is not set up.";
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return "Sign in first — notifications are tied to your account.";
  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: "test" }),
    });
    const j = (await res.json().catch(() => ({}))) as { sent?: number; tokens?: number; reason?: string; errors?: string[] };
    if (res.status === 503) return "The server isn't set up for notifications yet (Firebase key missing on Vercel).";
    if (!res.ok) return `The server said ${res.status}.`;
    if (!j.tokens) {
      const d = pushDiagnostics();
      return d.error ? `This phone isn't registered: ${d.error}` : "This phone isn't registered yet — allow notifications and reopen the app.";
    }
    if (!j.sent) return `Couldn't deliver (${(j.errors ?? []).join(", ") || "unknown"}).`;
    return "Sent! It should pop up in a moment.";
  } catch {
    return "No internet right now.";
  }
}

/** On logout: this phone should stop getting the old account's notifications. */
export async function forgetPushToken(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem("dockin-push-token");
    localStorage.removeItem("dockin-push-token");
  } catch {
    /* nothing stored */
  }
  const sb = getSupabase();
  if (sb && token) await sb.from("push_tokens").delete().eq("token", token);
  started = false;
}
