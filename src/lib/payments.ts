/**
 * Reading a payment out of a notification.
 *
 * The phone forwards the notifications that payment apps and banks post, and
 * everything below turns one of those into "₹60 at 24/7 Kathi" — or into
 * nothing at all, which is the common case and has to be cheap.
 *
 * Two decisions shape this file:
 *
 *  * **The full reading happens here, in the web app.** Indian banks and UPI
 *    apps word these messages a dozen different ways and keep changing them.
 *    The Android app opens the live site, so a wrong rule here is fixed by a
 *    deploy, not by a new APK. (The phone keeps a small copy of the debit rules
 *    only to ask "where did it go?" the moment you pay.)
 *  * **Nothing is ever added behind your back.** A parsed payment goes into a
 *    tray you confirm with one tap. An expense tracker that silently records the
 *    wrong amount is worse than one that records nothing, because you stop
 *    trusting the total — and the total is the whole product.
 */

import { DockIn, isNativeApp } from "./native";

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
  /**
   * Who was paid (money out) or who paid you (money in), as written, or null
   * when the message does not say.
   */
  merchant: string | null;
  /** The app that reported it, in words. */
  source: string;
  at: number;
  /** "out" is a spend; "in" is money that came to you. */
  dir: "out" | "in";
}

/** The apps worth listening to. Anything else the phone never forwards. */
export const PAY_APPS: Record<string, string> = {
  "com.google.android.apps.nbu.paisa.user": "Google Pay",
  "com.phonepe.app": "PhonePe",
  "net.one97.paytm": "Paytm",
  "in.org.npci.upiapp": "BHIM",
  "com.amazon.mShop.android.shopping": "Amazon Pay",
  "com.dreamplug.androidapp": "CRED",
  "com.mobikwik_new": "MobiKwik",
  "com.google.android.apps.messaging": "Messages",
  "com.samsung.android.messaging": "Messages",
  "com.android.mms": "Messages",
};

/** Money leaving, said outright. "Rahul paid you" is not one of these; see TO_YOU. */
const DEBIT = /\b(paid|debited|debit|sent|spent|withdrawn|deducted)\b/i;
/** Words used both ways ("payment of ₹500 received"); a spend only when nothing says money came in. */
const NEUTRAL = /\b(payment of|transferred)\b/i;
/** Money coming in. */
const CREDIT = /\b(credited|received|refund(?:ed)?|cashback|added to|paid you|sent you)\b/i;
const TO_YOU = /\b(?:paid|sent) you\b/gi;
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
  /\s+(?:on|using|via|from|through|at|by|ref|upi ref|txn|utr|a\/c|account|bank|successfully|success|is successful|has been|dated|to)\b.*$/i;
const NOT_A_NAME =
  /^(?:upi|neft|imps|rtgs|ach|nach|account|your account|your a\/c|bank|a\/c|cash|cash deposit|atm|card|number)$/i;

/** A usable name out of a raw capture, or null for a handle's plumbing, a bank word or a number. */
function clean(raw: string): string | null {
  let name = raw.trim();
  // A UPI handle is a name with plumbing attached: 247kathi@okaxis is 247kathi.
  const at = name.indexOf("@");
  if (at > 0) name = name.slice(0, at);
  name = name.replace(/[^\p{L}\p{N}&'/ .-]+/gu, " ").replace(/\s{2,}/g, " ").trim();
  // A bare reference number is not a name.
  if (name.length < 2 || !/\p{L}/u.test(name)) return null;
  if (NOT_A_NAME.test(name)) return null;
  return name.slice(0, 40).trim();
}

/** Pulls the payee out of "… to VPA kathi@okaxis on 03-10-26. Ref 1234". */
function merchantOf(text: string): string | null {
  const to =
    /\b(?:to|towards|at|in favour of)\s+(?:vpa\s+|upi\/|upi id\s+)?([^.,;\n]{2,60})/i.exec(text);
  if (!to) return null;
  const name = clean(to[1].replace(CLEAN_TAIL, ""));
  return name ? title(name) : null;
}

/** "Rahul paid you", "… from VPA rahul@okicici", "credited by Rahul Kumar" → the person. */
function payerOf(text: string): string | null {
  const named = /((?:\p{Lu}[\p{L}.']*\s?){1,3})\s+(?:paid|sent) you\b/u.exec(text);
  if (named) {
    const n = clean(named[1]);
    if (n) return title(n);
  }
  // "by UPI from rahul@okicici": the first "by" names no one, so keep looking
  // from just after it rather than after the whole capture.
  const scan = /\b(?:from|by)\s+(?:vpa\s+|upi\/|upi id\s+)?([^.,;\n]{2,60})/gi;
  let pos = 0;
  while (pos < text.length) {
    scan.lastIndex = pos;
    const m = scan.exec(text);
    if (!m) break;
    const n = clean(m[1].replace(CLEAN_TAIL, ""));
    if (n) return title(n);
    pos = m.index + m[0].length - m[1].length;
  }
  return null;
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
 * It only says yes when the message has an amount, is clear about which way
 * the money went, and does not look like an OTP, a balance or an offer. A
 * message that says both ("₹500 credited, ₹60 debited") is skipped: guessing
 * which half is yours is how a tracker ends up lying to you. False silence
 * costs one manual entry; a false yes costs trust in the number on the Money screen.
 */
export function parseNotice(n: Notice): Payment | null {
  const source = PAY_APPS[n.app];
  if (!source) return null;

  const body = redact(`${n.title ?? ""} ${n.text ?? ""}`.replace(/\s+/g, " ").trim());
  if (!body) return null;
  if (NOISE.test(body)) return null;
  const mine = body.replace(TO_YOU, " ");
  const credit = CREDIT.test(body);
  const debit = DEBIT.test(mine) || (!credit && NEUTRAL.test(mine));
  if (credit === debit) return null;

  const m = AMOUNT.exec(body);
  if (!m) return null;
  const amount = Number((m[1] ?? m[2]).replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;

  const dir = credit ? "in" : "out";
  return { amount, merchant: dir === "in" ? payerOf(body) : merchantOf(body), source, at: n.at, dir };
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
    const twin = out.find((q) => q.amount === p.amount && q.dir === p.dir && Math.abs(q.at - p.at) <= windowMs);
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
// The phone's inbox
// ---------------------------------------------------------------------------

export class PaymentError extends Error {}

/** One notification as the phone kept it. */
export interface StoredNotice {
  id: string;
  app: string;
  title: string;
  body: string;
  posted_at: number;
}

/**
 * Everything the phone has seen and nobody has dealt with yet.
 *
 * It lives on the phone itself now, written by the Android app's listener
 * whether DockIn is open or not. Nothing about a payment goes to any server
 * until it is confirmed and becomes an ordinary expense.
 */
export async function phoneInbox(): Promise<StoredNotice[]> {
  if (!isNativeApp()) return [];
  const { notices } = await DockIn.pending();
  return (notices ?? []).map((n) => ({
    id: n.id,
    app: n.app,
    title: n.title,
    body: n.body,
    posted_at: n.at,
  }));
}

/** Added or dismissed — either way it leaves the inbox. */
export async function clearNotices(ids: string[]): Promise<void> {
  if (ids.length === 0 || !isNativeApp()) return;
  await DockIn.ack({ ids });
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
    const twin = merged.find(
      (q) => q.amount === p.amount && q.dir === p.dir && Math.abs(q.at - p.at) <= 150_000,
    );
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
