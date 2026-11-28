/**
 * Server side of Web Push (iPhone / browser PWA notifications). Sits ALONGSIDE
 * the Android FCM path — it never touches it. If VAPID isn't configured it's a
 * no-op, so nothing breaks when the keys aren't set yet. Server-only.
 */

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

const PUBLIC = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const PRIVATE = process.env.VAPID_PRIVATE_KEY?.trim();
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:dockin@dockin.app";

let ready = false;
function configured(): boolean {
  if (ready) return true;
  if (!PUBLIC || !PRIVATE) return false;
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    ready = true;
    return true;
  } catch {
    return false;
  }
}
export const webPushConfigured = () => !!(PUBLIC && PRIVATE);

export interface WebPushPayload {
  title: string;
  body: string;
  path?: string;
  tag?: string;
  /** Broadcast id, for open-tracking (?n=) — matches the FCM path. */
  id?: string;
}

interface Sub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends one payload to every web subscription of the given users (null = all).
 * Drops subscriptions the push service reports as gone (404/410). Returns how
 * many pushes the service accepted.
 */
export async function sendWebPush(sb: SupabaseClient, userIds: string[] | null, payload: WebPushPayload): Promise<{ sent: number; failed: number; subs: number }> {
  if (!configured()) return { sent: 0, failed: 0, subs: 0 };

  const subs: Sub[] = [];
  if (userIds === null) {
    for (let done = false, from = 0; !done; from += 1000) {
      const { data } = await sb.from("web_push_subs").select("endpoint,p256dh,auth").range(from, from + 999);
      if (data) subs.push(...(data as Sub[]));
      done = !data || data.length < 1000;
    }
  } else if (userIds.length) {
    for (let i = 0; i < userIds.length; i += 200) {
      const { data } = await sb.from("web_push_subs").select("endpoint,p256dh,auth").in("user_id", userIds.slice(i, i + 200));
      if (data) subs.push(...(data as Sub[]));
    }
  }
  if (!subs.length) return { sent: 0, failed: 0, subs: 0 };

  const data = JSON.stringify({ title: payload.title, body: payload.body, path: payload.path ?? "/", tag: payload.tag, id: payload.id });
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  const pool = 30;
  for (let i = 0; i < subs.length; i += pool) {
    await Promise.all(
      subs.slice(i, i + pool).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, { TTL: 60 * 60 * 24 });
          sent++;
        } catch (e) {
          failed++;
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint);
        }
      }),
    );
  }
  if (dead.length) {
    for (let i = 0; i < dead.length; i += 200) await sb.from("web_push_subs").delete().in("endpoint", dead.slice(i, i + 200));
  }
  return { sent, failed, subs: subs.length };
}
