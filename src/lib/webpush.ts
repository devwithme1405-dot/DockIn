"use client";

/**
 * Browser side of Web Push — turns on notifications for the web / iPhone PWA.
 * On iOS this only works once DockIn is installed to the home screen (16.4+),
 * and the permission ask must come from a tap. Android/desktop Chrome work in
 * the tab too. Separate from the native (Capacitor) push — this is the browser
 * Push API with our VAPID key.
 */

import { getSupabase } from "./supabase";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

export function webPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID;
}

/** iOS needs the PWA added to the home screen before it will allow push. */
export function iosNeedsInstall(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export type WebPushState = "unsupported" | "needs-install" | "default" | "granted" | "denied";

export function webPushState(): WebPushState {
  if (!webPushSupported()) return "unsupported";
  if (iosNeedsInstall()) return "needs-install";
  const p = Notification.permission;
  return p === "granted" ? "granted" : p === "denied" ? "denied" : "default";
}

function urlB64ToUint8Array(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function token(): Promise<string | null> {
  const sb = getSupabase();
  return sb ? ((await sb.auth.getSession()).data.session?.access_token ?? null) : null;
}

/**
 * Asks for permission (if needed), subscribes this browser to Web Push, and
 * saves the subscription to the server. Returns the resulting state. Safe to
 * call again — it reuses an existing subscription.
 */
export async function enableWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return "unsupported";
  if (iosNeedsInstall()) return "needs-install";
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "default";

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID!) as BufferSource });

  const jwt = await token();
  if (!jwt) return "granted"; // subscribed locally; syncs once signed in
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  await fetch("/api/webpush/subscribe", {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, ua: navigator.userAgent }),
  }).catch(() => {});
  return "granted";
}

/** If this browser is already subscribed, make sure the server has it (e.g. after sign-in). */
export async function syncWebPush(): Promise<void> {
  try {
    if (!webPushSupported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const jwt = await token();
    if (!sub || !jwt) return;
    const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    await fetch("/api/webpush/subscribe", {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, ua: navigator.userAgent }),
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
}
