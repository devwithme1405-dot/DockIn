/**
 * Reading a payment out of a notification.
 *
 * The phone forwards the notifications that payment apps and banks post, and
 * everything below turns one of those into "₹60 at 24/7 Kathi" — or into
 * nothing at all, which is the common case and has to be cheap.
 *
 * Two decisions shape this file:
 *
 *  * **The parsing happens here, not on the phone.** Indian banks and UPI apps
 *    word these messages a dozen different ways and keep changing them. Keeping
 *    the rules in the web app means a wrong one is fixed by a deploy that
 *    everybody already gets, instead of an APK everybody has to reinstall.
 *  * **Nothing is ever added behind your back.** A parsed payment goes into a
 *    tray you confirm with one tap. An expense tracker that silently records the
 *    wrong amount is worse than one that records nothing, because you stop
 *    trusting the total — and the total is the whole product.
 */

import { getSupabase } from "./supabase";

export interface Notice {
  /** Android package that posted it, e.g. "com.google.android.apps.nbu.paisa.user". */
  app: string;
  title: string;
  text: string;
  /** When the phone saw it. */
  at: number;
}

export interface Payment {
  amount: number;
  /** Where the money went, as written, or null when the message does not say. */
  merchant: string | null;
  /** The app that reported it, in words. */
  source: string;
  at: number;
}

/** The apps worth listening to. Anything else the phone never forwards. */
export const PAY_APPS: Record<string, string> = {
  "com.google.android.apps.nbu.paisa.user": "Google Pay",
  "com.phonepe.app": "PhonePe",
  "net.one97.paytm": "Paytm",
  "in.org.npci.upiapp": "BHIM",
  "com.amazon.mShop.android.shopping": "Amazon Pay",
  "com.dreamplug.androidapp": "CRED",
  "com.google.android.apps.messaging": "Messages",
  "com.samsung.android.messaging": "Messages",
  "com.android.mms": "Messages",
};

/** Money leaving. "Credited" and "received" are someone paying you, not spending. */
const DEBIT = /\b(paid|debited|debit|sent|spent|withdrawn|deducted|payment of|transferred)\b/i;
const CREDIT = /\b(credited|received|refund(?:ed)?|cashback|added to)\b/i;
/** Messages that mention money but are not a payment. */
const NOISE =
  /\b(otp|one[- ]time|code|balance is|avl bal|available balance|due|reminder|offer|cashback up to|win|request(?:ed|s)? (?:money|payment)|will be|failed|declined|requesting)\b/i;

const AMOUNT =
  /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:₹|rupees)/i;

/**
 * Account and card numbers are not wanted and not kept. The phone strips them
 * before sending; this runs again here so an older phone cannot sneak one in.
 */
export function redact(text: string): string {
  return text
    .replace(
      /\b(?:a\/c|acct?|account|card)\s*(?:no\.?|number)?\s*[:#]?\s*(?:[x*]{2,}\s*)?[0-9]{3,}\b/gi,
      "account",
    )
    .replace(/\b[x*]{2,}[0-9]{3,}\b/gi, "account")
    .replace(/\b[0-9]{9,}\b/g, "number");
}

const CLEAN_TAIL =
  /\s+(?:on|using|via|from|through|at|by|ref|upi ref|txn|utr|a\/c|account|bank|successfully|success|is successful|has been|dated)\b.*$/i;

/** Pulls the payee out of "… to VPA kathi@okaxis on 03-10-26. Ref 1234". */
function merchantOf(text: string): string | null {
  const to =
    /\b(?:to|towards|at|in favour of)\s+(?:vpa\s+|upi\/|upi id\s+)?([^.,;\n]{2,60})/i.exec(text);
  if (!to) return null;

  let name = to[1].replace(CLEAN_TAIL, "").trim();
  // A UPI handle is a name with plumbing attached: 247kathi@okaxis is 247kathi.
  const at = name.indexOf("@");
  if (at > 0) name = name.slice(0, at);
  name = name.replace(/[^\p{L}\p{N}&'/ .-]+/gu, " ").replace(/\s{2,}/g, " ").trim();
  // A bare reference number is not a name.
  if (!name || !/\p{L}/u.test(name) || name.length < 2) return null;
  return title(name.slice(0, 40));
}

/** SHOUTED merchant names are the norm on UPI; nobody wants a feed of those. */
function title(s: string): string {
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s; // already mixed, leave it
  return s
    .toLowerCase()
    .replace(/\b[\p{L}\p{N}]/gu, (c) => c.toUpperCase())
    .replace(/\b(Pvt|Ltd|Llp|Hoc)\b/g, (m) => m.toUpperCase());
}

/**
 * One notification in, one payment or nothing out.
 *
 * It only says yes when the message has an amount, says money left, and does
 * not look like an OTP, a balance or an offer. False silence costs one manual
 * entry; a false yes costs trust in the number on the Money screen.
 */
export function parseNotice(n: Notice): Payment | null {
  const source = PAY_APPS[n.app];
  if (!source) return null;

  const body = redact(`${n.title ?? ""} ${n.text ?? ""}`.replace(/\s+/g, " ").trim());
  if (!body) return null;
  if (NOISE.test(body)) return null;
  if (!DEBIT.test(body)) return null;
  // "₹500 credited" and "₹60 debited" can share a message; the credit wins and
  // the whole thing is skipped, because guessing which half is the spend is how
  // a tracker ends up lying to you.
  if (CREDIT.test(body)) return null;

  const m = AMOUNT.exec(body);
  if (!m) return null;
  const amount = Number((m[1] ?? m[2]).replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;

  return { amount, merchant: merchantOf(body), source, at: n.at };
}

/** The key a merchant is remembered under, so spelling and case cannot split it. */
export function merchantKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Of two names for the same payment, the one that tells you more.
 *
 * A bank only knows the UPI handle — "kathi@okaxis" becomes "Kathi" — while the
 * payment app has the name the shop actually registered, "24/7 Kathi". More
 * words beats fewer, and a longer name beats a shorter one.
 */
function richer(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const score = (s: string) => s.trim().split(/\s+/).length * 100 + s.length;
  return score(b) > score(a) ? b : a;
}

/**
 * One payment usually arrives twice — once from the UPI app and once from the
 * bank, seconds apart. Same amount inside a couple of minutes is the same spend,
 * and the entry that knows the merchant is the one worth keeping.
 */
export function dedupe(list: Payment[], windowMs = 150_000): Payment[] {
  const byTime = [...list].sort((a, b) => a.at - b.at);
  const out: Payment[] = [];
  for (const p of byTime) {
    const twin = out.find((q) => q.amount === p.amount && Math.abs(q.at - p.at) <= windowMs);
    if (!twin) {
      out.push(p);
      continue;
    }
    const best = richer(twin.merchant, p.merchant);
    if (best !== twin.merchant) {
      twin.merchant = best;
      twin.source = p.source;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Talking to the server
// ---------------------------------------------------------------------------


export class PaymentError extends Error {}

/** One notification as the phone forwarded it. */
export interface StoredNotice {
  id: string;
  app: string;
  title: string;
  body: string;
  posted_at: number;
}

function sb() {
  const client = getSupabase();
  if (!client) throw new PaymentError("Cloud sync is not set up.");
  return client;
}

function plain(message: string): string {
  if (/not signed in/i.test(message)) return "Sign in first.";
  if (/unknown_device/i.test(message)) return "This phone is not linked any more.";
  if (/function .* does not exist|schema cache/i.test(message)) {
    return "Payment detection is not set up on the server yet.";
  }
  if (/Failed to fetch|NetworkError/i.test(message)) return "No internet right now.";
  return message;
}

/**
 * Mints the token this phone will use, and hands it to the Android app.
 *
 * The token is shown once and never stored in the browser: the app keeps it,
 * the server keeps only its hash. Re-linking replaces the old one, so a phone
 * that was wiped cannot keep posting.
 */
export async function linkDevice(label = "Phone"): Promise<string> {
  const { data, error } = await sb().rpc("link_payments", { device_label: label });
  if (error) throw new PaymentError(plain(error.message));
  return data as string;
}

/** Every phone currently allowed to forward notifications here. */
export async function linkedDevices(): Promise<
  { id: string; label: string | null; lastSeen: string | null }[]
> {
  const { data, error } = await sb()
    .from("pay_devices")
    .select("id,label,last_seen_at")
    .order("created_at", { ascending: false });
  if (error) throw new PaymentError(plain(error.message));
  return ((data ?? []) as { id: string; label: string | null; last_seen_at: string | null }[]).map(
    (d) => ({ id: d.id, label: d.label, lastSeen: d.last_seen_at }),
  );
}

export async function unlinkDevice(id: string): Promise<void> {
  const { error } = await sb().from("pay_devices").delete().eq("id", id);
  if (error) throw new PaymentError(plain(error.message));
}

/** Everything the phone has forwarded and nobody has dealt with yet. */
export async function inbox(): Promise<StoredNotice[]> {
  const { data, error } = await sb()
    .from("pay_notices")
    .select("id,app,title,body,posted_at")
    .order("posted_at", { ascending: false })
    .limit(60);
  if (error) throw new PaymentError(plain(error.message));
  return (data ?? []) as StoredNotice[];
}

/** Added or dismissed — either way it leaves the inbox. */
export async function clearNotices(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await sb().from("pay_notices").delete().in("id", ids);
  if (error) throw new PaymentError(plain(error.message));
}

/** A parsed payment, with the notice it came from so it can be cleared. */
export interface Detected extends Payment {
  ids: string[];
}

/**
 * The tray, built from the inbox: parse everything, throw away what is not a
 * payment, and fold the duplicate a bank and a UPI app always produce into one.
 */
export function detectedFrom(notices: StoredNotice[]): Detected[] {
  const parsed: Detected[] = [];
  for (const n of notices) {
    const p = parseNotice({ app: n.app, title: n.title, text: n.body, at: n.posted_at });
    if (p) parsed.push({ ...p, ids: [n.id] });
  }
  const merged: Detected[] = [];
  for (const p of parsed.sort((a, b) => a.at - b.at)) {
    const twin = merged.find((q) => q.amount === p.amount && Math.abs(q.at - p.at) <= 150_000);
    if (!twin) {
      merged.push({ ...p });
      continue;
    }
    twin.ids.push(...p.ids);
    const best = richer(twin.merchant, p.merchant);
    if (best !== twin.merchant) {
      twin.merchant = best;
      twin.source = p.source;
    }
  }
  return merged.sort((a, b) => b.at - a.at);
}

/** Notices that parsed as nothing are still rubbish in the inbox; clear them. */
export function strayIds(notices: StoredNotice[]): string[] {
  return notices
    .filter((n) => !parseNotice({ app: n.app, title: n.title, text: n.body, at: n.posted_at }))
    .map((n) => n.id);
}
