import { createHmac } from "node:crypto";

/**
 * A delivery receipt the recipient's phone sends back (/api/delivered) when a
 * chat push lands: signed by /api/push, so a phone can only ever say "I got
 * this", for its own account and that thread. Server-only.
 */
export function deliveryTicket(secret: string, uid: string, thread: string, at: string): string {
  return createHmac("sha256", secret).update(`${uid}|${thread}|${at}`).digest("base64url");
}
