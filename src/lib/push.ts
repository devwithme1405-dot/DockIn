"use client";

import { PushNotifications } from "@capacitor/push-notifications";
import { getSupabase } from "./supabase";
import { DockIn, isNativeApp } from "./native";

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

/**
 * Asks the server to notify people. On a weak line the request itself can fail,
 * and then nobody hears about the message — so each request waits in a small
 * queue on this phone and is retried until the server has it (the server only
 * accepts it for ten minutes, so old ones are dropped).
 */
export function notifyPush(event: PushEvent): void {
  const q = readQueue();
  const key = JSON.stringify(event);
  if (!q.some((x) => x.key === key)) q.push({ key, event, at: Date.now() });
  writeQueue(q);
  void flushPushes();
}

type Queued = { key: string; event: PushEvent; at: number };
const PUSH_QUEUE = "dockin-push-queue";
const PUSH_FOR = 10 * 60_000;

function readQueue(): Queued[] {
  try {
    const q = JSON.parse(localStorage.getItem(PUSH_QUEUE) || "[]") as Queued[];
    return Array.isArray(q) ? q.filter((x) => Date.now() - x.at < PUSH_FOR) : [];
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]): void {
  try {
    localStorage.setItem(PUSH_QUEUE, JSON.stringify(q.slice(-50)));
  } catch {
    /* memory only then */
  }
}

let pushing = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushTries = 0;

/** Sends what's waiting; a network failure leaves it for the next try. */
export async function flushPushes(): Promise<void> {
  if (pushing) return;
  const sb = getSupabase();
  if (!sb) return;
  pushing = true;
  clearTimeout(pushTimer);
  try {
    let token: string | undefined;
    try {
      token = (await sb.auth.getSession()).data.session?.access_token;
    } catch {
      token = undefined;
    }
    if (!token) throw new Error("no session yet");
    for (const item of readQueue()) {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(item.event),
        keepalive: true,
      });
      // 5xx and 429: try again. Anything else is an answer (sent, or not allowed): done.
      if (res.status >= 500 && res.status !== 503) throw new Error(String(res.status));
      if (res.status === 429) throw new Error("busy");
      writeQueue(readQueue().filter((x) => x.key !== item.key));
    }
    pushTries = 0;
  } catch {
    if (readQueue().length) pushTimer = setTimeout(() => void flushPushes(), [3_000, 8_000, 20_000, 45_000][Math.min(pushTries++, 3)]);
  } finally {
    pushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushPushes());
  window.addEventListener("dockin:back-online", () => void flushPushes());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushPushes();
  });
}

/** What this phone's DockIn can do with pushes ('data1': shows chat pushes itself and sends ✓✓). Older app: null. */
async function pushCaps(): Promise<string | null> {
  try {
    return (await DockIn.pushCaps()).caps ?? null;
  } catch {
    return null;
  }
}

/** Saves this phone's token for the account; works with a server not yet updated (no caps column). */
async function saveToken(sb: NonNullable<ReturnType<typeof getSupabase>>, token: string, user: string): Promise<{ message: string } | null> {
  const caps = await pushCaps();
  const row: Record<string, string> = { token, user_id: user, updated_at: new Date().toISOString() };
  const { error } = await sb.from("push_tokens").upsert(caps ? { ...row, caps } : row);
  if (error && caps && /caps/.test(error.message)) return (await sb.from("push_tokens").upsert(row)).error;
  return error;
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
        const error = await saveToken(sb, value, data.user.id);
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
  await saveToken(sb, token, data.user.id);
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
