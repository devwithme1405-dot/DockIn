"use client";

import { useSyncExternalStore } from "react";
import { DockIn, isNativeApp } from "../native";
import { fmtTime, fromDateStr, toDateStr } from "../dates";
import { needsProof, passSummary, type PassDraft } from "../outpass";
import { whatsappUrl } from "../money";
import { v3db, type PassStatus } from "./store";

/**
 * Outpass, the parts that leave DockIn: MyCamu (with the mail screenshot ready
 * for its upload button), the parents (a ready message), and — once — the
 * DockIn team (how MyCamu's form is sent, so a later version can submit it).
 */

/** Camu takes a screenshot, not a 6 MB photo: shrink big images to a sharp JPEG. */
export async function shrinkImage(b: Blob, max = 1800, quality = 0.86): Promise<Blob> {
  if (!b.type.startsWith("image/") || b.type === "image/gif") return b;
  if (b.type === "image/jpeg" && b.size < 900_000) return b;
  try {
    const bmp = await createImageBitmap(b);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return b;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
    return out && out.size < b.size ? out : b;
  } catch {
    return b;
  }
}

function toBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

const extOf = (type: string) => (type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "application/pdf" ? "pdf" : "jpg");

/**
 * MyCamu, signed in, with the pass pinned on top (and copied). For a leave the
 * mail screenshot goes along: when MyCamu's form asks for a file, DockIn offers
 * this exact image first.
 */
export async function sendToCamu(p: PassDraft, proof?: Blob): Promise<"opened" | "copied"> {
  const note = passSummary(p);
  try {
    await navigator.clipboard?.writeText(note);
  } catch {
    /* the pinned bar carries it anyway */
  }
  if (!isNativeApp()) return "copied";
  const opts: { path: string; note: string; proofData?: string; proofName?: string } = { path: "/", note };
  if (proof && needsProof(p)) {
    const small = await shrinkImage(proof);
    opts.proofData = await toBase64(small);
    opts.proofName = `mail-screenshot.${extOf(small.type)}`;
  }
  await DockIn.openCamu(opts);
  return "opened";
}

const day = (s: string) => fromDateStr(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** When the pass is for, in one readable line. */
export function passWhen(p: PassDraft): string {
  if (p.kind === "dayout") return `${day(p.fromDate)}, ${fmtTime(p.fromTime)} – ${fmtTime(p.toTime)}`;
  return `${day(p.fromDate)} ${fmtTime(p.fromTime)} → ${day(p.toDate)} ${fmtTime(p.toTime)}`;
}

/** The message for the parents: what was applied for, and what to do. */
export function parentText(p: PassDraft): string {
  const what = p.kind === "dayout" ? "a Day Out Pass" : p.leaveType === "Leave" ? "a leave" : `${p.leaveType.toLowerCase()} leave`;
  return [
    `Hi! I've applied for ${what} on MyCamu.`,
    `🗓 ${passWhen(p)}`,
    `📝 Reason: ${p.reason}`,
    "Please approve it in MyCamu when you can 🙏",
  ].join("\n");
}

/** The phone's share sheet; WhatsApp on the web (or on an APK from before it). */
export async function shareText(text: string, title = "Share"): Promise<void> {
  if (isNativeApp()) {
    try {
      await DockIn.shareText({ text, title });
      return;
    } catch {
      /* older APK: fall through to WhatsApp */
    }
  }
  window.open(whatsappUrl(text), "_blank", "noopener");
}

// ------------------------------------------------------------ straight to MyCamu

/** What happened when DockIn sent a Day Out to MyCamu itself. */
export type SendResult =
  | { kind: "made"; camuId?: string; status: "applied" | "approved"; record: CamuPass | null; already: boolean }
  /** MyCamu said no, in its own words: show it, don't save. */
  | { kind: "refused"; message: string }
  /** DockIn can't send it itself (old APK, not taught, signed out, offline): open MyCamu instead. */
  | { kind: "open"; why: string };

/** MyCamu's answer codes, in plain words. */
const CODES: Record<string, string> = {
  DUP_GATEPASS_EXISTS: "MyCamu has another pass or leave that overlaps this time. Cancel that one in MyCamu first, or pick another time.",
  LEAVE_MISSING_ON_WORKING_DAY: "MyCamu says this is a working day and wants a leave for it before a day out.",
};

export function codeWords(code: string, message?: string): string {
  if (code === "ERRORS" && message) {
    return /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(message.trim())
      ? `MyCamu flagged ${message.trim()} — usually there's already a leave or pass on that day. Cancel it in MyCamu, or start another day.`
      : `MyCamu said: ${message.trim()}`;
  }
  return CODES[code] ?? `MyCamu didn't take it (${code.replace(/_/g, " ").toLowerCase()}).`;
}

/** Why a day out can (or can't yet) go straight into MyCamu from this phone. */
export type DirectState = "ready" | "web" | "old-app" | "signed-out" | "not-taught";

export async function directState(): Promise<DirectState> {
  if (!isNativeApp()) return "web";
  try {
    const r = await DockIn.camuCanMakePass();
    if (r.ok) return "ready";
    if (r.connected === false) return "signed-out";
    return "not-taught";
  } catch {
    return "old-app";
  }
}

/** Can this phone send a pass to MyCamu without opening it? */
export async function canSendDirect(): Promise<boolean> {
  return (await directState()) === "ready";
}

/** One line on what's missing, for the student. */
export const DIRECT_WHY: Record<Exclude<DirectState, "ready">, string> = {
  web: "In the DockIn app, a day out goes straight into MyCamu.",
  "old-app": "Update to the newest DockIn test app to send day outs straight to MyCamu.",
  "signed-out": "Connect Camu in Profile to send day outs straight to MyCamu.",
  "not-taught": "Make one pass in MyCamu through DockIn once (History → Teach DockIn), then DockIn sends day outs itself.",
};

/** Parent / warden approval as DockIn shows it. */
function statusOf(r: Record<string, unknown>): PassStatus {
  const all = [r.status, r.prntAp, r.stfAp].map((x) => String(x ?? "").toUpperCase());
  if (all.some((x) => x.includes("REJ"))) return "rejected";
  if (all.some((x) => x.includes("CANC") || x === "CNCL")) return "cancelled";
  if (String(r.prntAp ?? "").toUpperCase() === "APPRVD" || String(r.status ?? "").toUpperCase() === "CMPT") return "approved";
  return "applied";
}

/** Can this pass (with this file) go straight into MyCamu from DockIn? */
export function sendable(p: PassDraft, proof?: Blob | null): boolean {
  if (p.kind === "dayout") return true;
  // Only plain leaves with an image were captured from MyCamu's form.
  return p.leaveType === "Leave" && !!proof && proof.type.startsWith("image/");
}

/**
 * A pass straight into MyCamu, the way MyCamu's own form sends it (for a
 * leave: the mail screenshot uploaded, then the leave), then checked against
 * MyCamu's list. Anything DockIn can't do itself falls back to opening MyCamu.
 */
export async function sendPass(p: PassDraft, proof?: Blob | null): Promise<SendResult> {
  if (!sendable(p, proof)) return { kind: "open", why: "not-sendable" };
  if (!(await canSendDirect())) return { kind: "open", why: "not-ready" };
  try {
    let r;
    if (p.kind === "dayout") {
      r = await DockIn.camuDayOut({ date: p.fromDate, from: p.fromTime, to: p.toTime, reason: p.reason });
    } else {
      const small = await shrinkImage(proof!);
      r = await DockIn.camuLeaveOut({
        fromDate: p.fromDate,
        fromTime: p.fromTime,
        toDate: p.toDate,
        toTime: p.toTime,
        reason: p.reason,
        proofData: await toBase64(small),
        proofName: `mail-screenshot.${extOf(small.type)}`,
        proofType: small.type || "image/jpeg",
      });
    }
    if (r.made) {
      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(r.record ?? "{}");
      } catch {
        /* the pass is there either way */
      }
      const st = statusOf(raw);
      return {
        kind: "made",
        camuId: typeof raw._id === "string" ? raw._id : undefined,
        status: st === "approved" ? "approved" : "applied",
        record: camuPassOf(raw),
        already: !!r.already,
      };
    }
    if (r.code === "NOT_IN_LIST") return { kind: "open", why: "unsure" };
    return { kind: "refused", message: codeWords(r.code ?? "UNKNOWN", r.message) };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "invalid") return { kind: "refused", message: (e as Error).message };
    return { kind: "open", why: code ?? "error" };
  }
}

/** Brings the statuses of passes DockIn sent up to date from MyCamu's list. Returns how many changed. */
export async function refreshFromCamu(passes: { id: string; camuId?: string; status: PassStatus }[]): Promise<number> {
  const mine = passes.filter((p) => p.camuId);
  if (!mine.length || !isNativeApp()) return 0;
  const r = await DockIn.camuPasses();
  const list = JSON.parse(r.items || "[]") as Record<string, unknown>[];
  const byId = new Map(list.filter((x) => typeof x._id === "string").map((x) => [x._id as string, x]));
  let changed = 0;
  for (const p of mine) {
    const rec = byId.get(p.camuId!);
    if (!rec) continue;
    const st = statusOf(rec);
    if (st !== p.status) {
      await v3db.passes.update(p.id, { status: st, updatedAt: Date.now() });
      changed++;
    }
  }
  return changed;
}


// ------------------------------------------------------------ MyCamu's own list

/** One pass (or leave) as MyCamu lists it, in DockIn's words. */
export interface CamuPass {
  id: string;
  kind: "dayout" | "leave" | "other";
  /** MyCamu's name for it: "Day Out Pass", "Leave Out Pass", "Leave"… */
  type: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  reason: string;
  state: "applied" | "approved" | "rejected" | "cancelled" | "out" | "back";
  /** Parent approval. */
  parent: "pending" | "approved" | "rejected";
  parentName?: string;
  /** Real times (ISO), when known. */
  appliedAt?: string;
  parentAt?: string;
  outAt?: string;
  inAt?: string;
  files: number;
}

const up = (x: unknown) => String(x ?? "").toUpperCase();
/** MyCamu writes pass times as Indian wall-clock with a "Z": read them as written. */
const wallDate = (x: unknown) => String(x ?? "").slice(0, 10);
const wallTime = (x: unknown) => String(x ?? "").slice(11, 16);

export function camuPassOf(r: Record<string, unknown>): CamuPass | null {
  if (typeof r._id !== "string") return null;
  const gate = typeof r.frdt === "string";
  const code = up(r.passTyCode);
  const name = String(r.passTyNme ?? r.LvTy ?? "Pass");
  const parentRaw = up(r.prntAp);
  const parent: CamuPass["parent"] = parentRaw.includes("REJ") ? "rejected" : parentRaw === "APPRVD" ? "approved" : "pending";
  const all = [up(r.status), up(r.stfAp), parentRaw, up(r.Stus)].join(" ");
  let state: CamuPass["state"] = "applied";
  if (all.includes("REJ")) state = "rejected";
  else if (all.includes("CANC") || all.includes("CNCL")) state = "cancelled";
  else if (r.isCIn === true || up(r.status) === "CMPT") state = "back";
  else if (r.isCOut === true) state = "out";
  else if (parent === "approved" || up(r.Stus).includes("APPROV")) state = "approved";
  const att = Array.isArray(r.atcmnt) ? r.atcmnt.length : Array.isArray(r.Attachments) ? r.Attachments.length : 0;
  return {
    id: r._id,
    kind: code === "DOP" ? "dayout" : code.includes("LEAVE") || /leave/i.test(name) ? "leave" : "other",
    type: name,
    fromDate: gate ? wallDate(r.frdt) : wallDate(r.start),
    fromTime: gate ? wallTime(r.frdt) : "",
    toDate: gate ? wallDate(r.todt) : wallDate(r.end),
    toTime: gate ? wallTime(r.todt) : "",
    reason: String(r.rson ?? r.Rson ?? "").trim(),
    state,
    parent,
    parentName: typeof r.prntName === "string" && r.prntName ? r.prntName : undefined,
    appliedAt: typeof r.CrAt === "string" ? r.CrAt : undefined,
    parentAt: typeof r.prntApAt === "string" ? r.prntApAt : undefined,
    outAt: typeof r.cOutDt === "string" ? r.cOutDt : undefined,
    inAt: typeof r.cInDt === "string" ? r.cInDt : undefined,
    files: att,
  };
}

/**
 * MyCamu's list made readable: each gate pass once (its twin attendance-leave
 * entry dropped), newest first.
 */
export function camuHistory(list: Record<string, unknown>[]): CamuPass[] {
  const gateIds = new Set(list.filter((r) => typeof r.frdt === "string").map((r) => String(r.lvId ?? "")));
  return list
    .filter((r) => typeof r.frdt === "string" || !gateIds.has(String(r.refId ?? "")))
    .map(camuPassOf)
    .filter((p): p is CamuPass => !!p && !!p.fromDate)
    .sort((a, b) => (b.fromDate + b.fromTime).localeCompare(a.fromDate + a.fromTime));
}

const CACHE = "dockin-camu-passes";

/** The last list read from MyCamu (works offline). */
export function cachedHistory(): { at: number; items: CamuPass[] } | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE) || "null");
    return v && Array.isArray(v.items) ? v : null;
  } catch {
    return null;
  }
}

/** Reads MyCamu's list now (and keeps it for offline). Throws when MyCamu can't be reached. */
export async function fetchHistory(): Promise<CamuPass[]> {
  const r = await DockIn.camuPasses();
  const items = camuHistory(JSON.parse(r.items || "[]"));
  try {
    localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), items }));
  } catch {
    /* private mode: fine */
  }
  historyListeners.forEach((f) => f());
  return items;
}

const historyListeners = new Set<() => void>();
let lastRaw: string | null = null;
let lastParsed: { at: number; items: CamuPass[] } | null = null;

/** MyCamu's list as last read, live (updates whenever DockIn reads it again). */
export function useCamuHistory(): { at: number; items: CamuPass[] } | null {
  return useSyncExternalStore(
    (f) => {
      historyListeners.add(f);
      return () => historyListeners.delete(f);
    },
    () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(CACHE);
      } catch {
        /* private mode */
      }
      if (raw !== lastRaw) {
        lastRaw = raw;
        lastParsed = cachedHistory();
      }
      return lastParsed;
    },
    () => null,
  );
}

/** Passes that count right now or later (submitted, approved, out). */
export const liveCamu = (items: CamuPass[], today: string) =>
  items.filter((c) => (c.state === "applied" || c.state === "approved" || c.state === "out") && c.toDate >= today && c.kind !== "other");

// ------------------------------------------------------------ clashes & cancelling

/** Still counts in MyCamu (not cancelled, rejected or finished). */
const live = (c: CamuPass) => c.state === "applied" || c.state === "approved" || c.state === "out";
const startOf = (c: { fromDate: string; fromTime: string }) => `${c.fromDate}T${c.fromTime || "00:00"}`;
const endOf = (c: { toDate: string; toTime: string }) => `${c.toDate}T${c.toTime || "23:59"}`;

/**
 * The MyCamu passes that stop this one: any live pass whose time overlaps it
 * (a leave 27 Nov–3 Dec blocks a day out on 1 Dec; a day out 3–7 pm blocks a
 * leave from 5 pm). MyCamu refuses the new one until those are cancelled.
 */
export function clashes(p: PassDraft, list: CamuPass[], now: Date = new Date()): CamuPass[] {
  const s = startOf(p);
  const e = endOf(p);
  const nowWall = `${toDateStr(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return list.filter((c) => live(c) && c.kind !== "other" && endOf(c) > nowWall && startOf(c) < e && s < endOf(c));
}

/** Can DockIn cancel this MyCamu pass (still ahead, not used at the gate)? */
export function cancellable(c: CamuPass, now: Date = new Date()): boolean {
  return (c.state === "applied" || c.state === "approved") && !c.outAt && c.toDate >= toDateStr(now) && c.kind !== "other";
}

/**
 * Cancels a pass in MyCamu the way MyCamu's button does, and checks MyCamu
 * shows it cancelled. "open" means this phone can't (older app): cancel in MyCamu.
 */
export async function cancelInCamu(id: string): Promise<{ ok: true } | { ok: false; message: string; open?: boolean }> {
  if (!isNativeApp()) return { ok: false, message: "Cancel it in MyCamu.", open: true };
  try {
    const r = await DockIn.camuCancel({ id });
    if (r.cancelled || r.code === "CNCL") return { ok: true };
    return { ok: false, message: `MyCamu didn't cancel it${r.code ? ` (${r.code.toLowerCase()})` : ""}. Try in MyCamu.`, open: true };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "invalid") return { ok: false, message: (e as Error).message };
    if (code === "expired") return { ok: false, message: "MyCamu sign-in has ended — open MyCamu to sign in.", open: true };
    if (code === "network") return { ok: false, message: "Couldn't reach MyCamu. Try again in a moment." };
    return { ok: false, message: "This app can't cancel yet — cancel it in MyCamu.", open: true };
  }
}

// ------------------------------------------------------------ verification

/** One line of "what you asked for" against "what MyCamu has". */
export interface Check {
  label: string;
  want: string;
  got: string;
  ok: boolean;
}

const dateWords = (s: string) => (s ? fromDateStr(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "—");

/**
 * Field by field, the pass as asked against the pass as MyCamu holds it — so a
 * glance at the gate says it is right.
 */
export function verifyPass(p: PassDraft, c: CamuPass | null): Check[] {
  const got = c ?? { kind: "other", fromDate: "", fromTime: "", toDate: "", toTime: "", reason: "" };
  const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
  return [
    { label: "Pass", want: p.kind === "dayout" ? "Day Out" : "Leave Out", got: c ? (c.kind === "dayout" ? "Day Out" : c.kind === "leave" ? "Leave Out" : c.type) : "—", ok: !!c && c.kind === p.kind },
    { label: "Date", want: dateWords(p.fromDate) + (p.toDate !== p.fromDate ? ` → ${dateWords(p.toDate)}` : ""), got: c ? dateWords(got.fromDate) + (got.toDate !== got.fromDate ? ` → ${dateWords(got.toDate)}` : "") : "—", ok: got.fromDate === p.fromDate && got.toDate === p.toDate },
    { label: "Out", want: fmtTime(p.fromTime), got: got.fromTime ? fmtTime(got.fromTime) : "—", ok: got.fromTime === p.fromTime },
    { label: "Back by", want: fmtTime(p.toTime), got: got.toTime ? fmtTime(got.toTime) : "—", ok: got.toTime === p.toTime },
    { label: "Reason", want: p.reason, got: got.reason || "—", ok: norm(got.reason) === norm(p.reason) },
  ];
}

/** Finds this pass in MyCamu's list (by id, else by type, day and times). */
export function findInHistory(p: PassDraft & { camuId?: string }, list: CamuPass[]): CamuPass | null {
  return (
    (p.camuId ? list.find((c) => c.id === p.camuId) : undefined) ??
    list.find((c) => c.kind === p.kind && c.fromDate === p.fromDate && c.fromTime === p.fromTime && c.toTime === p.toTime && c.state !== "cancelled" && c.state !== "rejected") ??
    null
  );
}

// ------------------------------------------------------------ teaching DockIn

/** One request MyCamu's page sent while it was open inside DockIn. */
export interface CamuNote {
  at: number;
  page: string;
  method: string;
  url: string;
  body: string;
  status: number;
  answer: string;
}

function list(json: string | undefined): CamuNote[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? (v as CamuNote[]) : [];
  } catch {
    return [];
  }
}

export interface CamuNotes {
  /** What MyCamu *sent* on the pass pages (the submit, the upload) — the part that matters. */
  writes: CamuNote[];
  picked: CamuNote[];
  recent: CamuNote[];
}

/** What DockIn has noted so far; null outside the app (or on an APK without it). */
export async function camuNotes(): Promise<CamuNotes | null> {
  if (!isNativeApp()) return null;
  try {
    const r = await DockIn.camuCaptured();
    return { writes: list(r.writes), picked: list(r.picked), recent: list(r.items) };
  } catch {
    return null;
  }
}

/** The path of a URL, without the host or query — enough to tell requests apart. */
export function notePath(n: CamuNote): string {
  try {
    return new URL(n.url, "https://x").pathname;
  } catch {
    return n.url.slice(0, 60);
  }
}

const READS = /\/(get|list|fetch|search|count|view)[^/]*\/?$|getall|config|dashboard|summary/i;
/** Anything to do with files is shown whole, even when named like a read ("/camuattchment/getappfile"). */
const FILES = /att?ch|upload|file/i;
/** Hosts that only count visits — never part of making a pass. */
const ANALYTICS = /google-analytics|googletagmanager|doubleclick|facebook\.|clarity\.ms|hotjar|sentry|mixpanel|segment\.io/i;
/** Anything but analytics: MyCamu's server, and wherever it uploads files to. */
const isCamu = (n: CamuNote) => !!n.url && !ANALYTICS.test(n.url);
/** Was this MyCamu sending something (not just reading)? Also for APKs that don't keep `writes`. */
export const isWrite = (n: CamuNote) => isCamu(n) && (FILES.test(n.url) || !READS.test(n.url));

/** Every distinct send, newest first: the same request twice counts once. */
function distinctSends(n: CamuNotes, max = 10): CamuNote[] {
  const all = [...n.writes, ...n.picked, ...n.recent].filter(isWrite).sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  return all
    .filter((w) => {
      const k = `${w.url}|${w.body}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max);
}

/**
 * What to send to the DockIn team, as messages small enough that nothing gets
 * cut on the way: each distinct MyCamu send whole (newest first), split over
 * as many parts as it takes; the reads as one counted line.
 */
export function notesParts(n: CamuNotes, limit = 2800): string[] {
  const sends = distinctSends(n);
  const counts = new Map<string, number>();
  const once = new Set<string>();
  for (const r of [...n.picked, ...n.recent].filter((x) => isCamu(x) && !isWrite(x))) {
    if (once.has(`${r.at}|${r.url}`)) continue;
    once.add(`${r.at}|${r.url}`);
    const k = `${r.method} ${notePath(r)} ${r.status}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const blocks = sends.map((w) =>
    JSON.stringify({ at: new Date(w.at).toISOString(), page: w.page, m: w.method, url: w.url, st: w.status, body: w.body, ans: w.answer.slice(0, 800) }),
  );
  if (counts.size) blocks.push(`READ: ${[...counts].map(([k, c]) => (c > 1 ? `${k} ×${c}` : k)).join(" | ")}`);
  if (!blocks.length) blocks.push("Nothing sent to MyCamu yet.");
  // Long blocks are cut into pieces; pieces are packed into parts.
  const pieces: string[] = [];
  for (const b of blocks) for (let i = 0; i < b.length; i += limit - 120) pieces.push(b.slice(i, i + limit - 120));
  const parts: string[] = [];
  for (const p of pieces) {
    if (parts.length && parts[parts.length - 1].length + p.length + 1 <= limit - 80) parts[parts.length - 1] += `\n${p}`;
    else parts.push(p);
  }
  const at = new Date().toISOString();
  return parts.map((p, i) => `DockIn · MyCamu notes · ${at} · part ${i + 1}/${parts.length} · ${sends.length} sent\n${p}`);
}

/** The whole report in one text (used where length does not matter). */
export function notesReport(n: CamuNotes): string {
  return notesParts(n, 1e9).join("\n");
}

export async function clearCamuNotes(): Promise<void> {
  if (!isNativeApp()) return;
  await DockIn.clearCamuCaptured().catch(() => {});
}

/** Opens MyCamu just to make a pass as usual, so DockIn can learn the form. */
export async function openCamuToTeach(): Promise<void> {
  if (!isNativeApp()) return;
  await DockIn.openCamu({ path: "/", note: "Make a pass as usual and submit it — DockIn is noting how MyCamu sends it." });
}
