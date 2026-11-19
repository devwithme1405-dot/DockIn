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

/**
 * Registers this phone for push and keeps its token current. Tapping a
 * notification opens the screen it is about (`data.path`).
 */
export async function startPush(open: (path: string) => void): Promise<void> {
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

    await PushNotifications.addListener("registration", async ({ value }) => {
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb.auth.getUser();
      if (!data.user) return;
      await sb.from("push_tokens").upsert({ token: value, user_id: data.user.id, updated_at: new Date().toISOString() });
      try {
        localStorage.setItem("dockin-push-token", value);
      } catch {
        /* only used to forget it on logout */
      }
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const path = (notification.data as { path?: string } | undefined)?.path;
      if (path && path.startsWith("/")) open(path);
    });

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;
    await PushNotifications.register();
  } catch {
    // A build without Firebase config throws here; the app works without push.
    started = false;
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
