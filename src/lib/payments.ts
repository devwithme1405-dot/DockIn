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

import { DockIn, isNativeApp, type PopupAnswer } from "./native";

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

/** Apps money usually moves through, by name. Others are read too (see sourceOf). */
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
  "indwin.c3.shareapp": "Slice",
  "money.jupiter": "Jupiter",
  "com.epifi.paisa": "Fi",
  "com.naviapp": "Navi",
  "money.super.payments": "super.money",
  "com.truecaller": "Messages",
  "com.oneplus.mms": "Messages",
  "com.xiaomi.mms": "Messages",
  "in.amazon.mShop.android.shopping": "Amazon Pay",
  "com.fampay.in": "FamPay",
  "com.freecharge.android": "Freecharge",
  "com.myairtelapp": "Airtel",
  "com.enstage.wibmo.hdfc": "PayZapp",
  "com.sbi.lotusintouch": "YONO SBI",
  "com.csam.icici.bank.imobile": "iMobile",
  "com.snapwork.hdfc": "HDFC Bank",
  "com.axis.mobile": "Axis Mobile",
  "com.msf.kbank.mobile": "Kotak",
  "com.google.android.apps.walletnfcrel": "Google Wallet",
};

/** Chats and social apps: a friend writing "I paid ₹60" is not your money moving. */
const NEVER_APPS = new Set([
  "com.whatsapp",
  "com.whatsapp.w4b",
  "org.telegram.messenger",
  "com.instagram.android",
  "com.snapchat.android",
  "com.discord",
  "com.facebook.orca",
  "com.facebook.katana",
  "com.twitter.android",
  "com.google.android.gm",
  "com.google.android.youtube",
]);

/**
 * Where a payment came from: a known app by name, any other app as "Other app"
 * (Slice before it was listed, a bank's own app), and never a chat.
 */
export function sourceOf(app: string): { name: string; known: boolean } | null {
  if (PAY_APPS[app]) return { name: PAY_APPS[app], known: true };
  if (!app || NEVER_APPS.has(app) || app.startsWith("com.dockin")) return null;
  return { name: "Other app", known: false };
}

/** Money leaving, said outright. "Rahul paid you" is not one of these; see TO_YOU. */
const DEBIT = /\b(paid|debited|debit|sent|spent|withdrawn|deducted)\b/i;
/** Words used both ways ("payment of ₹500 received"); a spend only when nothing says money came in. */
const NEUTRAL = /\b(payment of|transferred)\b/i;
/** Money coming in. */
const CREDIT = /\b(credited|received|refund(?:ed)?|reversed|reversal|cashback|added to|paid you|sent you)\b/i;
/**
 * The payee's side of your own spend: ICICI's "; KATHI credited" and the
 * "debited … and credited to rahul@okaxis" of a transfer. Taken out before
 * deciding the direction, and used as the payee's name.
 */
const PAYEE_CREDITED = /[;.]\s*(?![0-9])([^;.\n]{2,60}?)\s+credited\b(?!\s+to\s+(?:your|ur|a\/c|acct?|account)\b)/i;
const CREDITED_TO_OTHER =
  /\bcredited to\s+(?:vpa\s+|beneficiary\s+)?(?!(?:your|ur|a\/c|acct?|account)\b)([^.,;\n]{2,60})/i;
const TO_YOU = /\b(?:paid|sent) you\b/gi;
/** Messages that mention money but are not a payment. */
const NOISE =
  /\b(otp|one[- ]time|code|balance is|avl bal|available balance|due|reminder|offer|cashback up to|win|request(?:ed|s)? (?:money|payment)|will be|failed|declined|requesting|pending|scheduled|upcoming)\b/i;

const AMOUNT =
  /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:₹|rupees)/i;
/** SBI and a few others drop the rupee sign: "debited by 60.0". Only after a verb. */
const VERB_AMOUNT =
  /\b(?:debited|credited|withdrawn|deducted|spent)\s+(?:by|for|with|of)\s+([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?![0-9/-])/i;
/** Axis and others: "UPI/P2M/<ref>/KATHI" — the payee is the last part of the path. */
const UPI_PATH = /\bUPI\/(?:P2[AMP]\/)?(?:(?:number|[0-9]+)\/)?([A-Za-z][A-Za-z0-9 &.'-]{1,40}?)(?=\s+(?:not you|on|ref|info)\b|[/.]|\s*$)/i;

/** The amount in a message: a rupee sign first, a bare number after a verb only if there is none. */
function amountIn(text: string): number | null {
  const m = AMOUNT.exec(text);
  const raw = m ? (m[1] ?? m[2]) : VERB_AMOUNT.exec(text)?.[1];
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : null;
}

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
  /\s+(?:on|using|via|from|through|at|by|ref|refno|ref no|rrn|upi ref|txn|utr|a\/c|account|bank|successfully|success|is successful|has been|dated|to|not you|if not|for)\b.*$/i;
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
  if (/\batm\b/i.test(text) && /\bwithdraw/i.test(text)) return "ATM withdrawal";
  const path = UPI_PATH.exec(text);
  if (path) {
    const n = clean(path[1]);
    if (n) return title(n);
  }
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
  // Short shouted words that are really initials (KFC, B2B, HP) stay as they are.
  const keep = new Set(["THE", "AND", "FOR", "OF", "BY", "AN", "IN", "AT", "ON", "TO", "A"]);
  return s
    .split(/(\s+)/)
    .map((w) =>
      /\p{N}/u.test(w) && /\p{L}/u.test(w) && w.length <= 5 && w === w.toUpperCase()
        ? w
        : w.length <= 3 && w === w.toUpperCase() && /^\p{L}+$/u.test(w) && !keep.has(w)
          ? w
          : w.toLowerCase().replace(/(^|[^\p{L}\p{N}'])([\p{L}\p{N}])/gu, (_m, a: string, c: string) => a + c.toUpperCase()),
    )
    .join("")
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
  const from = sourceOf(n.app);
  if (!from) return null;
  const source = from.name;

  const body = redact(`${n.title ?? ""} ${n.text ?? ""}`.replace(/\s+/g, " ").trim());
  if (!body) return null;
  if (NOISE.test(body)) return null;
  const mine = body.replace(TO_YOU, " ");
  // A spend that also says the payee was credited is still only a spend.
  let payee: string | null = null;
  let creditText = body;
  if (DEBIT.test(mine)) {
    const side = CREDITED_TO_OTHER.exec(body) ?? PAYEE_CREDITED.exec(body);
    const raw = side && !DEBIT.test(side[1]) ? side[1] : null;
    const name = raw ? clean(raw.replace(CLEAN_TAIL, "")) : null;
    if (side && name) {
      payee = title(name);
      creditText = body.replace(side[0], " ");
    }
  }
  const credit = CREDIT.test(creditText);
  // An app not on the list has to say it outright; "payment of" alone is not enough.
  const debit = DEBIT.test(mine) || (from.known && !credit && NEUTRAL.test(mine));
  if (credit === debit) return null;

  const amount = amountIn(body);
  if (amount === null) return null;

  const dir = credit ? "in" : "out";
  return { amount, merchant: dir === "in" ? payerOf(body) : (payee ?? merchantOf(body)), source, at: n.at, dir };
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
  /** Answered in the popup already; the app files it without asking again. */
  answer?: PopupAnswer;
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
    ...(n.answer ? { answer: n.answer } : {}),
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

// ---------------------------------------------------------------------------
// The review tray: money we saw but could not read
// ---------------------------------------------------------------------------

/** A VPA or UPI handle anywhere in the text — a terse "₹60 to kathi@okaxis" with no verb. */
const MOVED = /\b(?:to|from)\b[^@\n]{0,40}@|\b(?:upi|imps|neft|rtgs)\b/i;

/**
 * A message that is clearly about money moving but that the parser could not
 * pin down — two amounts, both directions at once, an odd wording, a new bank
 * format. It has a rupee amount and either a spend/credit word or a UPI handle,
 * and it is not an OTP, a balance or an offer. These are the ones worth a
 * second look rather than silently dropping, because a dropped debit is a rupee
 * that never gets tracked — exactly what the Money screen promises not to do.
 */
export function looksFinancial(body: string): boolean {
  if (NOISE.test(body)) return false;
  if (!AMOUNT.test(body)) return false;
  return DEBIT.test(body) || CREDIT.test(body) || NEUTRAL.test(body) || MOVED.test(body);
}

/** One message in the review tray: shown as-is, with a best guess to pre-fill. */
export interface Unread {
  id: string;
  source: string;
  /** Redacted, for display. */
  text: string;
  at: number;
  amount: number | null;
  dir: "out" | "in" | null;
}

/**
 * Everything financial that the parser could not place with confidence, ready
 * for a one-tap manual add. The amount and direction are a guess to save typing,
 * never recorded on their own.
 */
export function reviewFrom(notices: StoredNotice[]): Unread[] {
  const out: Unread[] = [];
  for (const n of notices) {
    const from = sourceOf(n.app);
    if (!from) continue;
    if (parseNotice({ app: n.app, title: n.title, text: n.body, at: n.posted_at })) continue;
    const body = redact(`${n.title ?? ""} ${n.body ?? ""}`.replace(/\s+/g, " ").trim());
    if (!looksFinancial(body)) continue;
    const m = AMOUNT.exec(body);
    const amount = m ? Number((m[1] ?? m[2]).replace(/,/g, "")) : null;
    const credit = CREDIT.test(body);
    const debit = DEBIT.test(body);
    out.push({
      id: n.id,
      source: from.name,
      text: body.slice(0, 160),
      at: n.posted_at,
      amount: amount && Number.isFinite(amount) && amount > 0 && amount <= 1_000_000 ? amount : null,
      dir: credit && !debit ? "in" : debit && !credit ? "out" : null,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** The ids currently in the review tray, so junk-clearing never sweeps them away. */
function reviewIds(notices: StoredNotice[]): Set<string> {
  return new Set(reviewFrom(notices).map((u) => u.id));
}

/**
 * Notices that parsed as nothing and are not worth reviewing either — OTPs,
 * balance pings, adverts. Those are swept; anything that looks financial is held
 * back for the review tray instead.
 */
export function strayIds(notices: StoredNotice[]): string[] {
  const keep = reviewIds(notices);
  return notices
    .filter((n) => !keep.has(n.id) && !parseNotice({ app: n.app, title: n.title, text: n.body, at: n.posted_at }))
    .map((n) => n.id);
}
