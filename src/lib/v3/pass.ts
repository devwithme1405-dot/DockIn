"use client";

import { DockIn, isNativeApp } from "../native";
import { fmtTime, fromDateStr } from "../dates";
import { needsProof, passSummary, type PassDraft } from "../outpass";
import { whatsappUrl } from "../money";

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
/** MyCamu's own server (relative URLs, or *.camu.in) — not analytics and the like. */
const isCamu = (n: CamuNote) => n.url.startsWith("/") || /^https?:\/\/[^/]*camu\.in\//i.test(n.url);
/** Was this MyCamu sending something (not just reading)? Also for APKs that don't keep `writes`. */
export const isWrite = (n: CamuNote) => !!n.url && isCamu(n) && !READS.test(n.url);

/** One line per distinct send: the newest of each kind (same URL and same leave type). */
function distinctSends(n: CamuNotes): CamuNote[] {
  const all = [...n.writes, ...n.picked, ...n.recent].filter(isWrite).sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  return all.filter((w) => {
    const kind = w.body.match(/"(?:LvTy|passTy|PassTy)"\s*:\s*"([^"]*)"/)?.[1] ?? "";
    const k = `${notePath(w)}|${kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
